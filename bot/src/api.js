const fs=require("fs");
const path=require("path");
const demo=require("../../config/demo");
function markdownToHtml(markdown){
 const esc=s=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
 const inline=s=>esc(s).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" rel="noopener noreferrer">$1</a>').replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>").replace(/`(.+?)`/g,"<code>$1</code>");
 const out=[];let p=[],list=false;
 const closeList=()=>{if(list){out.push("</ul>");list=false;}};
 const closeP=()=>{if(p.length){out.push("<p>"+inline(p.join(" "))+"</p>");p=[];}};
 for(const line of markdown.split(/\r?\n/)){
  if(!line.trim()){closeP();closeList();continue;}
  const h=line.match(/^(#{1,6})\s+(.+)$/);
  if(h){closeP();closeList();const n=h[1].length;out.push("<h"+n+">"+inline(h[2])+"</h"+n+">");continue;}
  if(/^---+$/.test(line.trim())){closeP();closeList();out.push("<hr>");continue;}
  const li=line.match(/^\s*-\s+(.+)$/);
  if(li){closeP();if(!list){out.push("<ul>");list=true;}out.push("<li>"+inline(li[1])+"</li>");continue;}
  closeList();p.push(line.trim());
 }
 closeP();closeList();return out.join("\n");
}
module.exports=function(app,{db,client,sendAlert,sendDemo,sendDemoTTS,sendTTS,generateTransactionNumber,colors}){
const policyPage=(file,title)=>{const markdown=fs.readFileSync(path.join(__dirname,"../../",file),"utf8");return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"theme-color\" content=\"#101010\"><title>"+title+" | SmartBoot Response</title><style>*{box-sizing:border-box}body{margin:0;background:#101010;color:#e8e8e8;font:16px/1.7 system-ui,-apple-system,Segoe UI,sans-serif}header,main,footer{width:min(860px,calc(100% - 36px));margin:auto}header{padding:28px 0 12px;border-bottom:1px solid #303030}header a,footer a{color:#aaa;text-decoration:none}main{padding:28px 0 56px}h1,h2,h3{line-height:1.25;color:#fff}h1{font-size:2rem}h2{margin-top:2rem;font-size:1.35rem}a{color:#9ecbff}p,li{color:#d0d0d0}li{margin:.35rem 0}hr{border:0;border-top:1px solid #333;margin:24px 0}footer{padding:18px 0 32px;border-top:1px solid #303030;color:#999;font-size:.9rem}strong{color:#fff}</style></head><body><header><a href=\"/\">SmartBoot Response</a> · <a href=\"/TOS\">Terms</a> · <a href=\"/Privacy\">Privacy</a></header><main>"+markdownToHtml(markdown)+"</main><footer>Operated by <a href=\"https://midnightlabs.tech\">Midnight Labs</a> · <a href=\"mailto:hello@midnightlabs.tech\">hello@midnightlabs.tech</a></footer></body></html>";};
app.get("/TOS",(req,res)=>res.type("html").send(policyPage("TOS.md","Terms of Use")));
app.get("/Privacy",(req,res)=>res.type("html").send(policyPage("PRIVACY.md","Privacy Policy")));
app.post("/api/v1/alert", (req, res) => { // Legacy alert endpoint
	console.log(req.body);

	// Check length of inputs, if any are over 500 characters, return 400
	if (req.body.placeName.length > (process.env.MAX_LENGTH || 500) || req.body.systemName.length > (process.env.MAX_LENGTH || 500) || req.body.zoneName.length > (process.env.MAX_LENGTH || 500) || req.body.event.length > (process.env.MAX_LENGTH || 500)) {
		console.log(`${colors.red("[ERROR]")} Input too long. From ${req.ip}`);
		console.log(`${colors.red("[ERROR]")} PlaceName: ${req.body.placeName.length} SystemName: ${req.body.systemName.length} ZoneName: ${req.body.zoneName.length} EventName: ${req.body.event.length}`);
		res.status(400).send("Input too long");
	}
	// send no content response
	sendAlert(req.body.accountNumber, req.body.transaction, req.body.placeName, req.body.systemName, req.body.zoneNumber, req.body.zoneName, req.body.event).then(() => {
		res.status(204).send();
	}).catch((error) => {
		res.status(500).send(error);
	});
})

app.post("/api/v1/webhook/:brand/:accountNumber", (req, res) => {
	// Check length of inputs, if any are over 500 characters, return 400
	switch (req.params.brand) {
		case "kca":
			if (req.body.placeName.length > (process.env.MAX_LENGTH || 500) || req.body.systemName.length > (process.env.MAX_LENGTH || 500) || req.body.zoneName.length > (process.env.MAX_LENGTH || 500) || req.body.event.length > (process.env.MAX_LENGTH || 500)) {
				console.log(`${colors.red("[ERROR]")} Input too long. From ${req.ip}`);
				console.log(`${colors.red("[ERROR]")} PlaceName: ${req.body.placeName.length} SystemName: ${req.body.systemName.length} ZoneName: ${req.body.zoneName.length} EventName: ${req.body.event.length}`);
				res.status(400).send("Input too long");
			}
			if (String(req.params.accountNumber) === String(demo.accountId)) {
				// Generate the audio files, then post it to discord
				sendDemo(req.params.accountNumber, req.body.transaction, req.body.placeName, req.body.systemName, req.body.zoneNumber, req.body.zoneName, req.body.event, req.body.placeId).then(() => {
					res.status(204).send();
				}).catch((error) => {
					res.status(500).send(error);
				});
			} else {

				// send alert to accountNumber
				sendAlert(req.params.accountNumber, req.body.transaction, req.body.placeName, req.body.systemName, req.body.zoneNumber, req.body.zoneName, req.body.event).then((resp) => {
					if (resp == "Cooldown") {
						return res.status(429).send("Cooldown");
					}
					res.status(204).send();
				}).catch((error) => {
					res.status(500).send(error);
				});
			}
			break;
		default:
			res.status(400).send("Brand not found");
			break;
	}
});

app.post("/api/v1/tts", (req, res) => {
	// Check length of inputs, if any are over 500 characters, return 400
	if (req.body.text.length > (process.env.MAX_LENGTH || 500)) {
		console.log(`${colors.red("[ERROR]")} Input too long. From ${req.ip}`);
		console.log(`${colors.red("[ERROR]")} Text: ${req.body.text.length}`);
		res.status(400).send("Input too long");
	}
	console.log(req.body);
	// send no content response
	(String(req.body.accountNumber) === String(demo.accountId) ? sendDemoTTS(req.body.accountNumber, req.body.transaction, req.body.text) : sendTTS(req.body.accountNumber, req.body.transaction, req.body.text)).then(() => {
		res.status(204).send();
	}).catch((error) => {
		res.status(500).send(error);
		console.log(error.stack)
	});
});

app.ws("/api/v1/websocket/:accountNumber", (ws, req) => {
	var userData;
	// Check if account number is valid and is verified
	db.get("SELECT * FROM accounts WHERE id = ? AND verified = 1", req.params.accountNumber, (err, row) => {
		if (err) {
			console.error(err);
			ws.send(JSON.stringify({ status: "error", code: 500, message: "Internal Server Error", timestamp: new Date().toISOString() }));
			ws.close();
			return;
		} else if (row) {
			userData = row;
			ws.send(JSON.stringify({ status: "connected", code: 200, timestamp: new Date().toISOString() }));
		} else {
			ws.send(JSON.stringify({ status: "error", code: 404, message: "Account not found or not verified", timestamp: new Date().toISOString() }));
			ws.close();
			return;
		}
	});

	ws.on("message", (msg) => {
		// Validate json
		try {
			msg = JSON.parse(msg);
		} catch (error) {
			console.error(error);
			ws.send(JSON.stringify({ status: "error", message: "Invalid JSON", timestamp: new Date().toISOString() }));
			return;
		}
		switch (msg.action) {
			case "close":
				ws.send(JSON.stringify({ response: "closed", timestamp: new Date().toISOString() }));
				ws.close();
				break;
			case "ping":
				ws.send(JSON.stringify({ response: "pong", timestamp: new Date().toISOString() }));
				break;
			case "getStatus":
				// Get the armState column from the account database
				db.get("SELECT armState FROM accounts WHERE id = ?", req.params.accountNumber, (err, row) => {
					if (err) {
						console.error(err);
						ws.send(JSON.stringify({ action: msg.action, status: "error", code: 500, message: "Internal Server Error", timestamp: new Date().toISOString() }));
					} else {
						ws.send(JSON.stringify({ action: msg.action, status: "success", code: 200, armState: row.armState, timestamp: new Date().toISOString() }));
					}
				});
				break;
			case "report":
				console.log(msg)
				// Check length of inputs, if any are over 500 characters, return 400
				if (msg.data.placeName.length > (process.env.MAX_LENGTH || 500) || msg.data.systemName.length > (process.env.MAX_LENGTH || 500) || msg.data.zoneName.length > (process.env.MAX_LENGTH || 500) || msg.data.event.length > (process.env.MAX_LENGTH || 500)) {
					console.log(`${colors.red("[ERROR]")} Input too long.`);
					console.log(`${colors.red("[ERROR]")} PlaceName: ${msg.data.placeName.length} SystemName: ${msg.data.systemName.length} ZoneName: ${msg.data.zoneName.length} EventName: ${msg.data.event.length}`);
					ws.send(JSON.stringify({ action: msg.action, status: "error", code: 400, message: "Input too long", timestamp: new Date().toISOString() }));
					return;
				}

				// Check cooldown
				if (new Date(userData.cooldown) > new Date()) {
					console.log("Cooldown")
					ws.send(JSON.stringify({ action: msg.action, status: "error", code: 429, message: "Cooldown", timestamp: new Date().toISOString() }));
					return;
				} else {
					console.log("Not cooldown")
					newCooldown = new Date();
					newCooldown.setMinutes(newCooldown.getMinutes() + 5);
				}

				sendAlert(req.params.accountNumber, generateTransactionNumber(), msg.data.placeName, msg.data.systemName, msg.data.zoneNumber, msg.data.zoneName, msg.data.event).then(() => {
					ws.send(JSON.stringify({ action: msg.action, status: "success", code: 200, timestamp: new Date().toISOString() }));
				}).catch((error) => {
					ws.send(JSON.stringify({ action: msg.action, status: "error", code: 500, message: error, timestamp: new Date().toISOString() }));
				});
				break;
			case "updateState":
				// Update the armState column in the account database
				db.run("UPDATE accounts SET armState = ? WHERE id = ?", msg.armState, req.params.accountNumber, (err) => {
					if (err) {
						console.error(err);
						ws.send(JSON.stringify({ action: msg.action, status: "error", code: 500, message: "Internal Server Error", timestamp: new Date().toISOString() }));
					} else {
						ws.send(JSON.stringify({ action: msg.action, status: "success", code: 200, timestamp: new Date().toISOString() }));
					}
				});
				break;

		}
	});
});


app.get('/api/healthcheck', async (req, res) => {
	const timestamp = new Date().toISOString();
	const checks = {};
	checks.api = { status: 'online', message: 'API is responding' };
	checks.bot = { status: client.isReady() ? 'online' : 'offline', message: client.isReady() ? 'Discord bot is connected' : 'Discord bot is not connected' };
	checks.database = await new Promise(resolve => {
		db.get('SELECT 1 AS ok', (err, row) => resolve({ status: !err && row && row.ok === 1 ? 'online' : 'offline', message: err ? err.message : row ? 'Database query successful' : 'Database query failed' }));
	});
	checks.asterisk = await require('./services/sip').checkConnection().then(() => ({ status: 'online', message: 'Asterisk AMI is reachable' })).catch(error => ({ status: 'offline', message: error.message }));
	const sipConfigured = ['SIP_SERVER','SIP_SERVER_PORT','SIP_USERNAME','SIP_AUTH_USERNAME','SIP_PASSWORD','SIP_ADVERTISED_IP'].every(key => Boolean(process.env[key]));
	checks.sip = { status: sipConfigured ? 'configured' : 'misconfigured', message: sipConfigured ? 'SIP provider settings are present' : 'One or more SIP provider settings are missing' };
	const failed = Object.values(checks).some(check => ['offline','misconfigured'].includes(check.status));
	res.status(failed ? 503 : 200).json({
		status: failed ? 'degraded' : 'healthy',
		healthy: !failed,
		service: 'SmartBoot Response',
		version: require('../../package.json').version,
		uptime: Math.floor(process.uptime()),
		timestamp,
		checks
	});
});

startTime = new Date();
client.login(process.env.DISCORD_TOKEN);
};
