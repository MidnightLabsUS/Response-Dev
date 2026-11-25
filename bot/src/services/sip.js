const fs=require("fs"),net=require("net"),path=require("path");
const req=h=>Object.entries(h).map(([k,v])=>k+": "+v).join("\r\n")+"\r\n\r\n";
const cfg=()=>{for(const k of["ASTERISK_AMI_PASSWORD","SIP_SERVER","SIP_USERNAME","SIP_PASSWORD","SIP_ADVERTISED_IP"])if(!process.env[k])throw Error(k+" is required")};
const ami=(action,fields={})=>new Promise((resolve,reject)=>{
 const s=net.createConnection(Number(process.env.ASTERISK_AMI_PORT||5038),process.env.ASTERISK_AMI_HOST||"asterisk");
 let b="",done=false,actionSent=false;
 const finish=(e,r)=>{if(done)return;done=true;s.destroy();e?reject(e):resolve(r)};
 s.setTimeout(10000,()=>finish(Error("Asterisk AMI timeout")));
 s.on("error",e=>finish(e));
 s.on("data",d=>{b+=d.toString();let i;while((i=b.indexOf("\r\n\r\n"))>=0){const x=b.slice(0,i);b=b.slice(i+4);const r={};for(const l of x.split("\r\n")){const n=l.indexOf(":");if(n>0)r[l.slice(0,n).toLowerCase()]=l.slice(n+1).trim()}if(r.response){const status=r.response.toLowerCase();if(!actionSent){if(status!=="success")return finish(Error(r.message||"Asterisk AMI login failed"));actionSent=true;s.write(req({Action:action,ActionID:"smartboot-"+Date.now(),...fields}))}else finish(status==="success"?null:Error(r.message||"Asterisk AMI error"),r)}}});
 s.on("connect",()=>s.write(req({Action:"Login",ActionID:"login",Username:process.env.ASTERISK_AMI_USER||"smartboot",Secret:process.env.ASTERISK_AMI_PASSWORD,Events:"off"})));
});
async function originate(number,audio){
 cfg();number=String(number).replace(/[^0-9+]/g,"");if(!number)throw Error("Invalid destination phone number");
 const id=path.basename(audio).replace(/\.wav$/i,"").replace(/[^a-zA-Z0-9_-]/g,""),dir="/app/data/calls",file=path.join(dir,id+".wav");
 await fs.promises.mkdir(dir,{recursive:true});await fs.promises.copyFile(audio,file);
 await ami("Originate",{Channel:"Local/"+number+"@smartboot-outbound",Timeout:"30000",CallerID:process.env.SIP_CALLER_ID||"SmartBoot Response",Variable:"__ALERT_FILE=calls/"+id,Async:"true"});
 console.log("[ASTERISK] Call queued to",number);
 setTimeout(()=>fs.promises.unlink(file).catch(()=>{}),10*60*1000).unref();
 return true;
}
async function checkConnection(){cfg();await ami("Ping",{});console.log("[ASTERISK] AMI connected");return true}
module.exports={originate,checkConnection};