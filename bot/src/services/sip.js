const dgram=require("dgram"),fs=require("fs"),crypto=require("crypto");
const md5=s=>crypto.createHash("md5").update(s).digest("hex");
const req=(m,u,h,b="")=>m+" "+u+" SIP/2.0\r\nVia: SIP/2.0/UDP "+h.via+":"+h.port+";branch="+h.branch+";rport\r\nMax-Forwards: 70\r\nFrom: <sip:"+process.env.SIP_CALLER_ID+"@"+h.domain+">;tag="+h.tag+"\r\nTo: <sip:"+h.number+"@"+h.domain+">"+(h.toTag?";tag="+h.toTag:"")+"\r\nCall-ID: "+h.callid+"\r\nCSeq: "+h.cseq+" "+m+"\r\nContact: <sip:"+process.env.SIP_USERNAME+"@"+h.via+":"+h.port+">"+(m==="INVITE"?"\r\nContent-Type: application/sdp":"")+"\r\nUser-Agent: SmartBoot Response\r\nContent-Length: "+Buffer.byteLength(b)+"\r\n\r\n"+b;
const parse=s=>{const [x,...r]=s.split("\r\n"),m=x.match(/^SIP\/2.0 (\d+) (.*)$/),h={};for(const l of r){const i=l.indexOf(":");if(i>0)h[l.slice(0,i).toLowerCase()]=l.slice(i+1).trim()}return{code:m?+m[1]:0,reason:m?m[2]:"",headers:h,body:r.join("\r\n\r\n")}};
const send=(s,m,h,p)=>new Promise((r,j)=>s.send(Buffer.from(m),p,h,e=>e?j(e):r()));
const auth=(h,m,u)=>{const x=(h["www-authenticate"]||h["proxy-authenticate"]||"").match(/realm="([^"]+)"[^\r\n]*nonce="([^"]+)"/);if(!x)return;const q=(h["www-authenticate"]||h["proxy-authenticate"]||"").match(/qop="?([^",]+)"?/),cn=crypto.randomBytes(8).toString("hex"),nc="00000001",ha1=md5(process.env.SIP_AUTH_USERNAME+":"+x[1]+":"+process.env.SIP_PASSWORD),ha2=md5(m+":"+u),z=q?md5(ha1+":"+x[2]+":"+nc+":"+cn+":"+q[1]+":"+ha2):md5(ha1+":"+x[2]+":"+ha2);return'Digest username="'+process.env.SIP_AUTH_USERNAME+'",realm="'+x[1]+'",nonce="'+x[2]+'",uri="'+u+'",response="'+z+'"'+(q?',qop='+q[1]+',nc='+nc+',cnonce="'+cn+'"':"")};
const wav=f=>{const b=fs.readFileSync(f),i=b.indexOf(Buffer.from("fmt ")),d=b.indexOf(Buffer.from("data"));if(i<0||d<0)throw Error("Invalid WAV");if(b.readUInt16LE(i+10)!==1||b.readUInt32LE(i+12)!==8000||b.readUInt16LE(i+22)!==16)throw Error("Audio must be 8kHz mono PCM16");return b.subarray(d+8)};
const ulaw=x=>{const B=132,C=32635;let s=x<0?128:0;if(x<0)x=-x;if(x>C)x=C;x+=B;let e=7;for(let t=x>>7;t>1;t>>=1)e--;return(~(s|(e<<4)|((x>>(e+3))&15)))&255};
function cfg(){for(const k of["SIP_SERVER","SIP_USERNAME","SIP_AUTH_USERNAME","SIP_PASSWORD","SIP_CALLER_ID","SIP_ADVERTISED_IP"])if(!process.env[k])throw Error(k+" is required")}
const wait=(sock,timeout=30000)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>{sock.off("message",fn);reject(Error("SIP response timeout"))},timeout),fn=m=>{const r=parse(m.toString());console.log("[SIP] Response:",r.code,r.reason);if(r.code>=200){clearTimeout(t);sock.off("message",fn);resolve(r)}};sock.on("message",fn)});
async function originate(number,audio){
 cfg();number=String(number).replace(/[^0-9+]/g,"");if(!number)throw Error("Invalid destination phone number");
 const data=wav(audio),sip=dgram.createSocket("udp4"),rtps=dgram.createSocket("udp4"),server=process.env.SIP_SERVER,port=Number(process.env.SIP_SERVER_PORT||5060),localPort=Number(process.env.SIP_LOCAL_PORT||5060),domain=process.env.SIP_DOMAIN||server,rtp=Number(process.env.SIP_RTP_PORT||10000),advertised=process.env.SIP_ADVERTISED_IP,via=advertised,tag=crypto.randomBytes(8).toString("hex"),callid=crypto.randomBytes(12).toString("hex")+"@"+advertised,uri="sip:"+number+"@"+domain,branch=()=>"z9hG4bK"+crypto.randomBytes(8).toString("hex");
 await new Promise((r,j)=>sip.bind(localPort,"0.0.0.0",e=>e?j(e):r()));await new Promise((r,j)=>rtps.bind(rtp,"0.0.0.0",e=>e?j(e):r()));
 console.log("[SIP] Direct SIP call to",number+" via "+server+":"+port);
 const sdp="v=0\r\no=smartboot 1 1 IN IP4 "+advertised+"\r\ns=SmartBoot\r\nc=IN IP4 "+advertised+"\r\nt=0 0\r\nm=audio "+rtp+" RTP/AVP 0\r\na=rtpmap:0 PCMU/8000\r\na=ptime:20\r\na=sendrecv\r\n";
 let cseq=1;
 try{
  let h={via,port:localPort,domain,tag,callid,number,cseq,branch:branch()};
  let w=wait(sip);await send(sip,req("INVITE",uri,h,sdp),server,port);let r=await w;
  if(r.code===401||r.code===407){const a=auth(r.headers,"INVITE",uri);if(!a)throw Error("SIP authentication challenge missing");h.cseq=++cseq;h.branch=branch();let m=req("INVITE",uri,h,sdp).replace("Content-Type: application/sdp\r\n",(r.headers["proxy-authenticate"]?"Proxy-Authorization: ":"Authorization: ")+a+"\r\nContent-Type: application/sdp\r\n");w=wait(sip);await send(sip,m,server,port);r=await w}
  if(r.code<200||r.code>=300)throw Error("SIP INVITE failed: "+r.code+" "+r.reason);
  h.toTag=(r.headers.to.match(/tag=([^;>]+)/)||[])[1];const inviteCseq=h.cseq;h.cseq=++cseq;h.branch=branch();h.cseq=inviteCseq;await send(sip,req("ACK",uri,h),server,port);
  const remote=(r.body.match(/c=IN IP4 ([^\r\n]+)/)||[])[1],rp=+(r.body.match(/m=audio (\d+)/)||[])[1];if(!remote||!rp)throw Error("SIP response did not provide RTP destination");
  console.log("[SIP] RTP:",advertised+":"+rtp+" -> "+remote+":"+rp);
  const ssrc=crypto.randomBytes(4).readUInt32BE(0);
  for(let i=0,seq=0;i<data.length;i+=320,seq++){const p=Buffer.alloc(172);p.writeUInt8(128,0);p.writeUInt8(seq%256,1);p.writeUInt32BE(seq*160>>>0,4);p.writeUInt32BE(ssrc,8);for(let j=0;j<160&&i+j*2<data.length;j++)p[12+j]=ulaw(data.readInt16LE(i+j*2));await send(rtps,p,remote,rp);await new Promise(r=>setTimeout(r,20))}
  h.cseq=++cseq;h.branch=branch();await send(sip,req("BYE",uri,h),server,port);console.log("[SIP] Call completed");return true
 }finally{sip.close();rtps.close()}
}
async function checkConnection(){cfg();console.log("[SIP] Direct SIP configured for "+process.env.SIP_SERVER+":"+process.env.SIP_SERVER_PORT);return true}
module.exports={originate,checkConnection};