const fs=require("fs");const colors=require("colors");const db=require("./database");const ttsCommands=require("../config/tts.json");const demo=require("../../config/demo");const {runCommand,runFile}=require("./runtime");const {generateTTS}=require("./services/tts");const {originate}=require("./services/sip");const {buildAlertSpeech,sanitizeForTTS,withRepeatPrompt}=require("./speech");let handledTransactions=[];let client;
function generateAccountNumber() {
	let accountNumber = Math.floor(Math.random() * 10000000000);
	db.get("SELECT * FROM accounts WHERE id = ?", accountNumber, (err, row) => {
		if (err) {
			console.error(err);
		} else if (row) {
			accountNumber = generateAccountNumber();
		}
	});
	return accountNumber;
}
function generateTransactionNumber() {
	return Math.floor(Math.random() * 10000000000);
}
function sendDemo(accountNumber, transaction, placeName, systemName, zoneNumber, zoneName, event, placeId) {
	return new Promise((resolve, reject) => {
		if (handledTransactions.includes(transaction)) {
			resolve(); // Duplicate transaction
		} else {
			handledTransactions.push(transaction);
			// Check if the account exists and is verified

			if (placeName.length > (process.env.MAX_LENGTH || 500) || systemName.length > (process.env.MAX_LENGTH || 500) || zoneName.length > (process.env.MAX_LENGTH || 500) || event.length > (process.env.MAX_LENGTH || 500)) {
				console.log(`${colors.red("[ERROR]")} Input too long.`);
				console.log(`${colors.red("[ERROR]")} PlaceName: ${placeName.length} SystemName: ${systemName.length} ZoneName: ${zoneName.length} EventName: ${event.length}`);
				reject("Input too long");
			}
			// Account exists and is verified
			// Send the alert
			runCommand(ttsCommands[0].command.replace("%s", `/tmp/${transaction}.wav`), withRepeatPrompt(buildAlertSpeech(event, placeName, zoneNumber, zoneName))).then((output) => {
				runCommand(`ffmpeg -y -i /tmp/${transaction}.wav -ar 8000 -ac 1 -c:a pcm_s16le /tmp/${transaction}-alert.wav`).then(() => {
					runCommand(`rm /tmp/${transaction}.wav`)
					// strip extension from filename

					new (require("discord.js").WebhookClient)({url:demo.webhookUrl}).send({
						embeds: [{
							title: "Demo Alert",
							description: `Place: [${placeName}](https://roblox.com/games/${placeId}/linkgenerator)\nSystem: ${systemName}\nZone: ${zoneNumber} - ${zoneName}\nEvent: ${event}`
						}],
						files: [{
							attachment: `/tmp/${transaction}-alert.wav`,
							name: `${transaction}-alert.wav`
						}]
					}).then(() => {
						resolve();
					}).catch((error) => {
						console.error(error);
						reject(error);
					});
				}).catch((error) => {
					console.error(error);
					reject(error);
				});
			}).catch((error) => {
				console.error(error);
				reject(error);
			});
		}
	});
}
function sendAlert(accountNumber, transaction, placeName, systemName, zoneNumber, zoneName, event) {
	// replace any non alphanumeric characters with nothing in all inputs
	placeName = placeName.replace(/[^a-zA-Z0-9]/g, "");
	systemName = systemName.replace(/[^a-zA-Z0-9]/g, "");
	zoneName = zoneName.replace(/[^a-zA-Z0-9]/g, "");
	event = event.replace(/[^a-zA-Z0-9]/g, "");
	//zoneNumber = zoneNumber.replace(/[^a-zA-Z0-9]/g, "");
	return new Promise((resolve, reject) => {
		if (handledTransactions.includes(transaction)) {
			resolve(); // Duplicate transaction
		} else {
			handledTransactions.push(transaction);
			// Check if the account exists and is verified
			db.get("SELECT * FROM accounts WHERE id = ? AND verified = 1", accountNumber, (err, row) => {
				if (err) {
					console.error(err);
					reject(err);
				} else if (row) {
					if (new Date(row.cooldown) > new Date()) {
						console.log("Cooldown")
						reject("Cooldown");
						return;
					} else {
						console.log("Not cooldown")
						newCooldown = new Date();
						newCooldown.setMinutes(newCooldown.getMinutes() + 5);

						db.run("UPDATE accounts SET cooldown = ? WHERE id = ?", newCooldown.toISOString(), accountNumber, (err) => {
							if (err) {
								console.error(err);
							}
						});
					}

					// Check if any of the inputs are over 500 characters, if so reject
					if (placeName.length > (process.env.MAX_LENGTH || 500) || systemName.length > (process.env.MAX_LENGTH || 500) || zoneName.length > (process.env.MAX_LENGTH || 500) || event.length > (process.env.MAX_LENGTH || 500)) {
						console.log(`${colors.red("[ERROR]")} Input too long.`);
						console.log(`${colors.red("[ERROR]")} PlaceName: ${placeName.length} SystemName: ${systemName.length} ZoneName: ${zoneName.length} EventName: ${event.length}`);
						reject("Input too long");
					}

					// Account exists and is verified
					// Send the alert
					runCommand(ttsCommands[row.ttsOverride].command.replace("%s", `/tmp/${transaction}.wav`), withRepeatPrompt(buildAlertSpeech(event, placeName, zoneNumber, zoneName))).then((output) => {
						runCommand(`ffmpeg -y -i /tmp/${transaction}.wav -ar 8000 -ac 1 -c:a pcm_s16le /tmp/${transaction}-alert.wav`).then(() => {
							runCommand(`rm /tmp/${transaction}.wav`)
							// strip extension from filename

							originate(row.phone,`/tmp/${transaction}-alert.wav`).then(() => {
								console.log(`Alert sent to ${row.phone}`);
								db.run("INSERT INTO alert_history (transaction_id,account_id,source_account_id,place_name,system_name,zone_number,zone_name,event_name,delivered_at) VALUES (?,?,?,?,?,?,?,?,?)",String(transaction),String(accountNumber),String(accountNumber),placeName,systemName,String(zoneNumber??""),zoneName,event,new Date().toISOString(),err=>{if(err)console.error("[ALERT HISTORY]",err);});
								resolve();
							}).catch((error) => {
								console.error(error);
								reject(error);
							});

							db.get("SELECT * FROM links WHERE linked_from = ?", accountNumber, (err, row) => {
								if (err) {
									console.error(err);
								} else if (row) {
									db.get("SELECT * FROM accounts WHERE id = ?", row.linked_to, (err, row) => {
										if (err) {
											console.error(err);
										} else if (row) {
											originate(row.phone,`/tmp/${transaction}-alert.wav`).then(() => {
												console.log(`Alert sent to ${row.phone}`);
											db.run("INSERT INTO alert_history (transaction_id,account_id,source_account_id,place_name,system_name,zone_number,zone_name,event_name,delivered_at) VALUES (?,?,?,?,?,?,?,?,?)",String(transaction),String(row.id),String(accountNumber),placeName,systemName,String(zoneNumber??""),zoneName,event,new Date().toISOString(),err=>{if(err)console.error("[ALERT HISTORY]",err);});
											}).catch((error) => {
												console.error(error);
											});
										}
									});
								}
							});
						}).catch((error) => {
							console.error(error);
							reject(error);
						});
					}).catch((error) => {
						console.error(error);
						reject(error);
					});
				} else {
					resolve();
					// Account does not exist or is not verified
				}
			});
		}
	});
}

function sendDemoTTS(accountNumber,transaction,text){
 return new Promise(async(resolve,reject)=>{
  const id=String(transaction).replace(/[^a-zA-Z0-9_-]/g,"");
  if(!id)return reject(new Error("Invalid transaction ID"));
  if(!demo.webhookUrl||demo.webhookUrl.includes("PUT_DISCORD_WEBHOOK_URL_HERE"))return reject(new Error("Demo Discord webhook is not configured"));
  if(handledTransactions.includes(transaction))return resolve();
  handledTransactions.push(transaction);
  const source=`/tmp/${id}-demo-tts.wav`,audio=`/tmp/${id}-demo-tts-alert.wav`;
  try{
   await generateTTS(`${process.env.CALL_PREFIX_TEXT||""} ${sanitizeForTTS(text)}`.trim(),source);
   await runFile("ffmpeg",["-y","-i",source,"-ar","8000","-ac","1","-c:a","pcm_s16le",audio]);
   await fs.promises.unlink(source).catch(()=>{});
   await new (require("discord.js").WebhookClient)({url:demo.webhookUrl}).send({embeds:[{title:"Demo Alert",description:String(text)}],files:[{attachment:audio,name:`${id}-tts.wav`}]});
   resolve();
  }catch(error){await fs.promises.unlink(source).catch(()=>{});reject(error);}
  finally{await fs.promises.unlink(audio).catch(()=>{});}
 });
}
function sendTTS(accountNumber, transaction, text) {
	// Set textFiltered to a string safe for TTS input
	const textFiltered = sanitizeForTTS(text)
	return new Promise((resolve, reject) => {
		if (handledTransactions.includes(transaction)) {
			resolve(); // Duplicate transaction
		} else {
			handledTransactions.push(transaction);
			// Check if the account exists and is verified
			db.get("SELECT * FROM accounts WHERE id = ? AND verified = 1", accountNumber, (err, row) => {
				if (err) {
					console.error(err);
					reject(err);
				} else if (row) {
					// Account exists and is verified
					// Send the alert
					runCommand(ttsCommands[row.ttsOverride].command.replace("%s", `/tmp/${transaction}.wav`), withRepeatPrompt(`${process.env.CALL_PREFIX_TEXT||""} ${textFiltered}`)).then((output) => {
						runCommand(`ffmpeg -y -i /tmp/${transaction}.wav -ar 8000 -ac 1 -c:a pcm_s16le /tmp/${transaction}-tts.wav`).then(() => {
							runCommand(`rm /tmp/${transaction}.wav`)
							// strip extension from filename

							originate(row.phone,`/tmp/${transaction}-tts.wav`).then(() => {
								console.log(`TTS sent to ${row.phone}`);
								db.run("INSERT INTO alert_history (transaction_id,account_id,source_account_id,place_name,system_name,zone_number,zone_name,event_name,delivered_at) VALUES (?,?,?,?,?,?,?,?,?)",String(transaction),String(accountNumber),String(accountNumber),"TTS Alert","Phone","","",String(text),new Date().toISOString(),err=>{if(err)console.error("[ALERT HISTORY]",err);});
								resolve();
							}).catch((error) => {
								console.error(error);
								reject(error);
							});

							db.get("SELECT * FROM links WHERE linked_from = ?", accountNumber, (err, row) => {
								if (err) {
									console.error(err);
								} else if (row) {
									db.get("SELECT * FROM accounts WHERE id = ?", row.linked_to, (err, row) => {
										if (err) {
											console.error(err);
										} else if (row) {
											originate(row.phone,`/tmp/${transaction}-tts.wav`).then(() => {
												console.log(`TTS sent to ${row.to}`);
												db.run("INSERT INTO alert_history (transaction_id,account_id,source_account_id,place_name,system_name,zone_number,zone_name,event_name,delivered_at) VALUES (?,?,?,?,?,?,?,?,?)",String(transaction),String(row.id),String(accountNumber),"TTS Alert","Phone","","",String(text),new Date().toISOString(),err=>{if(err)console.error("[ALERT HISTORY]",err);});
											}).catch((error) => {
												console.error(error);
											});
										}
									});
								}
							});
						}).catch((error) => {
							console.error(error);
							reject(error);
						});
					}).catch((error) => {
						console.error(error);
						reject(error);
					});
				} else {
					resolve();
					// Account does not exist or is not verified
				}
			});
		}
	});
}
function sendVerificationCode(account) {
	return new Promise((resolve,reject) => {
		db.get("SELECT * FROM accounts WHERE id = ?",account,async(err,row) => {
			try {
				if(err)throw err;
				if(!row)throw new Error("Account not found");
				const wait=await new Promise((res,rej)=>db.get("SELECT cooldown FROM verification_cooldowns WHERE account_id = ?",String(account),(e,r)=>e?rej(e):res(r&&new Date(r.cooldown)>new Date()?Math.ceil((new Date(r.cooldown)-Date.now())/1000):0)));if(wait)throw new Error("Cooldown:"+wait);
				const source=`/tmp/${account}-code.wav`,audio=`/tmp/${account}-verification.wav`;
				const digits=row.verification_code.split("").join(", ");
				await generateTTS(`${process.env.CALL_PREFIX_TEXT} To verify your phone number, enter this code in Discord. Your verification code is ${digits}. Repeating, ${digits}.`,source);
				await runFile("ffmpeg",["-y","-i",source,"-ar","8000","-ac","1","-c:a","pcm_s16le",audio]);
				await fs.promises.unlink(source).catch(()=>{});
				await originate(row.phone,audio);
				const cooldown=new Date(Date.now()+60*1000);
				await new Promise((res,rej)=>db.run("INSERT INTO verification_cooldowns (account_id,cooldown) VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET cooldown=excluded.cooldown",String(account),cooldown.toISOString(),e=>e?rej(e):res()));
				console.log(`Verification code sent to ${row.phone}`);
				resolve();
			} catch(error) {
				reject(error);
			}
		});
	});
}
function generatePhoneCode() {
	// generate 6 digit
	return Math.floor(100000 + Math.random() * 900000).toString();
}
function setClient(c){client=c}module.exports={generateAccountNumber,generateTransactionNumber,sendDemo,sendDemoTTS,sendAlert,sendTTS,sendVerificationCode,generatePhoneCode,setClient};