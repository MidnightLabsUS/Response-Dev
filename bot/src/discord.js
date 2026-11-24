const Discord=require("discord.js");const colors=require("colors");const {Routes}=Discord;module.exports=function(client,rest,commands,{db,ttsCommands,sendVerificationCode,generateAccountNumber,generatePhoneCode,app,port,checkConnection}){const startTime=new Date();
const adminIds=(process.env.ADMIN_DISCORD_IDS||"").split(",").map(x=>x.trim()).filter(Boolean);
const adminRoleIds=(process.env.ADMIN_ROLE_IDS||"").split(",").map(x=>x.trim()).filter(Boolean);
const isAdmin=i=>adminIds.includes(i.user.id)||!!i.member?.roles?.cache?.some(role=>adminRoleIds.includes(role.id));
client.on("ready", async () => {
	//sendDemo("6371787150", generateTransactionNumber(), "KCA Product Showcase", "Building Security", 1, "Front Door", "alarm");
	console.log(`${colors.cyan("[Discord]")} Logged in as ${client.user.tag}`);

	const commands = require("../config/commands.json");
	commands.push({
		name: "set-voice",
		description: "Choose the voice used when your account receives spoken alerts.",
		type: 1,
		options: [
			{
				"name": "account_number",
				"description": "Choose the account whose alert voice you want to change.",
				"type": 3,
				"required": true,
				"autocomplete": true
			},
			{
				name: "voice",
				description: "Voice used to speak alerts sent to your phone.",
				type: 3,
				required: true,
				choices: ttsCommands
			}
		]
	})
	//Register commands
	await (async () => {
		try {
			console.log(`${colors.cyan("[Discord]")} Registering Commands...`)
			//Global
			await rest.put(Routes.applicationCommands(client.user.id), { body: commands })
			console.log(`${colors.cyan("[Discord]")} Successfully registered commands. Took ${colors.green((Date.now() - startTime) / 1000)} seconds.`);
		} catch (error) {
			console.error(error);
		}
	})();
	app.listen(port, () => {
		console.log(`${colors.cyan("[EXPRESS]")} Listening on ${port}`);
	});
});

client.on("interactionCreate", async (interaction) => {
	switch (interaction.type) {
		case Discord.InteractionType.ApplicationCommand:

			switch (interaction.commandName) {

				case "alerts":
					await interaction.deferReply({flags:64});
					db.all("SELECT h.* FROM alert_history h JOIN accounts a ON a.id=h.account_id WHERE a.discord_id=? ORDER BY h.delivered_at DESC LIMIT 10",interaction.user.id,(err,rows)=>{
						if(err){console.error(err);return interaction.editReply("Could not load alert history. Please contact support.");}
						if(!rows?.length)return interaction.editReply("No delivered alerts found for your accounts.");
						const lines=rows.map(x=>"**"+x.event_name+"** — "+x.place_name+"\n"+x.system_name+" | Zone "+(x.zone_number||"")+" "+x.zone_name+"\n<t:"+Math.floor(new Date(x.delivered_at).getTime()/1000)+":R>").join("\n\n");
						interaction.editReply({content:"**Your recent alerts**\n"+lines});
					});
					break;
				case "admin":
					if(!isAdmin(interaction))return interaction.reply({content:"You are not authorized to use administrator commands.",flags:64});
					await interaction.deferReply({flags:64});
					db.get("SELECT COUNT(*) AS total,SUM(CASE WHEN verified=1 THEN 1 ELSE 0 END) AS verified,SUM(CASE WHEN verified=0 THEN 1 ELSE 0 END) AS pending FROM accounts",(err,stats)=>{
						if(err){console.error(err);return interaction.editReply("Could not load administrator statistics.");}
						db.all("SELECT transaction_id,account_id,event_name,place_name,delivered_at FROM alert_history ORDER BY delivered_at DESC LIMIT 5",(e,rows)=>{
							if(e){console.error(e);return interaction.editReply("Could not load system activity.");}
							const activity=rows?.length?rows.map(x=>"`"+x.account_id+"` • "+x.event_name+" at "+x.place_name+" • <t:"+Math.floor(new Date(x.delivered_at).getTime()/1000)+":R>").join("\n"):"No alert activity recorded.";
							interaction.editReply("**SmartBoot Administration**\nAccounts: **"+(stats.total||0)+"**\nVerified: **"+(stats.verified||0)+"**\nPending: **"+(stats.pending||0)+"**\n\n**Recent activity**\n"+activity);
						});
					});
					break;
				case "lookup":
					if(!isAdmin(interaction))return interaction.reply({content:"You are not authorized to use administrator commands.",flags:64});
					await interaction.deferReply({flags:64});
					const lookup=interaction.options.getString("query").trim();
					const digits=lookup.replace(/\D/g,"");
					db.all("SELECT id,discord_id,phone,verified,ttsOverride FROM accounts WHERE CAST(id AS TEXT)=? OR discord_id=? OR phone LIKE ? ORDER BY id DESC LIMIT 10",lookup,lookup,"%"+(digits||lookup)+"%",(err,rows)=>{
						if(err){console.error(err);return interaction.editReply("Account lookup failed.");}
						if(!rows?.length)return interaction.editReply("No matching accounts found.");
						const result=rows.map(x=>"**Account `"+x.id+"`**\nDiscord: `"+x.discord_id+"`\nPhone: `"+x.phone+"`\nStatus: "+(x.verified?"Verified":"Pending")).join("\n\n");
						interaction.editReply({content:"**Account lookup**\n"+result});
					});
					break;
				case "status":
					await interaction.deferReply({flags:64});
					const dbOk=await new Promise(resolve=>db.get("SELECT 1 AS ok",err=>resolve(!err)));
					const pbxOk=checkConnection?await checkConnection().then(()=>true).catch(()=>false):false;
					const discordOk=client.isReady();
					interaction.editReply("**SmartBoot Service Status**\nDiscord: "+(discordOk?"Online":"Offline")+"\nAPI: Online\nDatabase: "+(dbOk?"Connected":"Unavailable")+"\nSIP: "+(pbxOk?"Configured":"Unavailable"));
					break;
				case "setup":
					await interaction.deferReply({flags:64});
					phone_number = interaction.options.getString("phone_number");
					// Check that phone_number is either a 4 digit number starting with 1, a 7 digit number, a 10 digit number, or an 11 digit number starting with 1
					if(!/^(?:\d{2,6}|\d{7}|\d{10}|1\d{10})$/.test(phone_number)) {
						interaction.editReply({ ephemeral: true, content: "Invalid destination. Enter a 2–6 digit PBX extension, 7-digit local number, or 10/11-digit phone number." });
						return;
					}
					// check that the user doesnt have any unverified accounts already (check discord_id and verified)
					db.get("SELECT * FROM accounts WHERE discord_id = ? AND verified = 0", interaction.user.id, (err, row) => {
						if (err) {
							console.error(err);
							interaction.editReply({content:"Database error. Please contact support."});
						} else if (row) {
							sendVerificationCode(row.id).then(() => interaction.editReply({content:`A verification call has been placed to ${row.phone}. Enter the six-digit code with \`/verify\` to activate your account.`})).catch(err=>interaction.editReply({content:err.message.startsWith("Cooldown")?`A call was sent recently. Wait ${err.message.split(":")[1]||60} seconds before resending.`:"We couldn't place your verification call. Check the destination and try again."}));
						} else {
							accountNumber = generateAccountNumber();
							verification_code = generatePhoneCode();
							db.run("INSERT INTO accounts (id, discord_id, verification_code, phone) VALUES (?, ?, ?, ?)", accountNumber, interaction.user.id, verification_code, phone_number, (err) => {
								if (err) {
									console.error(err);
								} else {
									sendVerificationCode(accountNumber).then(() => {
										interaction.editReply({
											content: `Your account has been created. A verification call is being placed to ${phone_number}. Enter the six-digit code with \`/verify\` to activate it.`,
											ephemeral: true
										})
									}).catch(err => interaction.editReply({content:err.message.startsWith("Cooldown")?`A call was sent recently. Wait ${err.message.split(":")[1]||60} seconds before resending.`:"We couldn't place your verification call. Please try again or contact support.",flags:64}))
								}
							});
						}
					});
					break;
				case "verify":
					verification_code = interaction.options.getString("verification_code");
					db.get("SELECT * FROM accounts WHERE verification_code = ? AND verified = 0", verification_code, (err, row) => {
						if (err) {
							console.error(err);
						} else if (row) {
							db.run("UPDATE accounts SET verified = 1 WHERE verification_code = ?", verification_code, (err) => {
								if (err) {
									console.error(err);
								} else {
									interaction.reply({
										content: `Your account is verified and ready to use. Account ID: \`${row.id}\`.\nFor help setting up the dialer, feel free to contact a member of staff!`,
										ephemeral: true
									})
								}
							});
						} else {
							interaction.reply({ ephemeral: true, content: "Invalid verification code." });
						}
					});
					break;
				case "resend-code":
					await interaction.deferReply({flags:64});
					// Find the account thats unverified owned by the user
					db.get("SELECT * FROM accounts WHERE discord_id = ? AND verified = 0", interaction.user.id, (err, row) => {
						if (err) {
							console.error(err);
						} else if (row) {
							sendVerificationCode(row.id).then(() => {
								interaction.editReply({
									content: `A new verification call has been placed to ${row.phone}. Enter the six-digit code with \`/verify\` to finish setup.`,
									ephemeral: true
								});
							}).catch(err=>interaction.editReply({content:err.message.startsWith("Cooldown")?`A call was sent recently. Wait ${err.message.split(":")[1]||60} seconds before resending.`:"We couldn't place your verification call. Please try again or contact support.",flags:64}))
						} else {
							interaction.editReply({ ephemeral: true, content: "No pending setup found. Run `/setup` to register a destination." });
						}
					});
					break;
				case "accounts":
					// list all active accounts owned by the user
					db.all("SELECT * FROM accounts WHERE discord_id = ? AND verified = 1", interaction.user.id, (err, rows) => {
						if (err) {
							console.error(err);
						} else if (rows) {
							let accountList = "";
							rows.forEach((row) => {
								accountList += `\`${row.id}\` - \`${row.phone}\`\n`;
							});
							interaction.reply({
								content: `Your verified accounts:\n${accountList}`,
								ephemeral: true
							});
						} else {
							interaction.reply({ ephemeral: true, content: "No verified accounts found. Run `/setup` to register one." });
						}
					});
					break;
				case "remove-account": // Deactivate an account
					// Check that account_number is owned by the user, if it is, delete the row
					accountNumber = interaction.options.getString("account_number");
					db.get("SELECT * FROM accounts WHERE discord_id = ? AND id = ?", interaction.user.id, accountNumber, (err, row) => {
						if (err) {
							console.error(err);
						} else if (row) {
							db.run("DELETE FROM accounts WHERE id = ?", accountNumber, (err) => {
								if (err) {
									console.error(err);
								} else {
									db.run("DELETE FROM links WHERE linked_from = ? OR linked_to = ?", accountNumber, accountNumber, (err) => {
										if (err) {
											console.error(err);
										} else {
											interaction.reply({
												content: "Account deleted successfully. Associated alert-forwarding links were also removed.",
												ephemeral: true
											});
										}
									});
								}
							});
						} else {
							interaction.reply({ ephemeral: true, content: "You don't own that account." });
						}
					});
					break;
				case "update-account": // If the account is owned by the user and verified, update the phone number, unverify it, and send verification to the new number. Do the same checks as register
					accountNumber = interaction.options.getString("account_number");
					phone_number = interaction.options.getString("phone_number");
					db.get("SELECT * FROM accounts WHERE discord_id = ? AND id = ? AND verified = 1", interaction.user.id, accountNumber, (err, row) => {
						if (err) {
							console.error(err);
						} else if (row) {
							if (!/^(1\d{3}|\d{7}|\d{10}|1\d{10})$/.test(phone_number)) {
								interaction.reply({ ephemeral: true, content: "Invalid phone number. Please enter one of the following:\n- A 4 digit LiteNet extension.\n- A 7 digit TandmX number\n- An 10 digit US phone number.\n- An 11 digit US phone number" });
								return;
							}
							verification_code = generatePhoneCode();
							db.run("UPDATE accounts SET phone = ?, verified = 0, verification_code = ? WHERE id = ?", phone_number, verification_code, accountNumber, (err) => {
								if (err) {
									console.error(err);
								} else {
									sendVerificationCode(accountNumber);
									interaction.reply({
										content: `Destination updated to ${phone_number}. A verification call is being placed now. Enter the six-digit code with `/confirm` to reactivate this account.`,
										ephemeral: true
									});
								}
							});
						} else {
							interaction.reply({ content: "You don't own that account.", ephemeral: true });
						}
					});
					break;
				case "cancel-setup": // Cancel an unverified account
					// Check if the user has an unverified account, if they do, delete it
					db.get("SELECT * FROM accounts WHERE discord_id = ? AND verified = 0", interaction.user.id, (err, row) => {
						if (err) {
							console.error(err);
						} else if (row) {
							db.run("DELETE FROM accounts WHERE discord_id = ? AND verified = 0", interaction.user.id, (err) => {
								if (err) {
									console.error(err);
								} else {
									interaction.reply({
										content: "Pending account setup cancelled. The unverified account has been deleted.",
										ephemeral: true
									});
								}
							});
						} else {
							interaction.reply({ content: "No pending setup found. Run `/setup` to register a destination.", ephemeral: true });
						}
					});
					break;
				case "link-account": // Link two account numbers together, only allow linking if both accounts are owned by the user and verified
					// check that both account numbers from and to are owned by the user and verified
					accountNumberFrom = interaction.options.getString("from");
					accountNumberTo = interaction.options.getString("to");
					db.get("SELECT * FROM accounts WHERE discord_id = ? AND id = ? AND verified = 1", interaction.user.id, accountNumberFrom, (err, row) => {
						if (err) {
							console.error(err);
						} else if (row) {
							db.get("SELECT * FROM accounts WHERE discord_id = ? AND id = ? AND verified = 1", interaction.user.id, accountNumberTo, (err, row) => {
								if (err) {
									console.error(err);
								} else if (row) {
									// check that the link doesnt already exist in `link`
									db.get("SELECT * FROM links WHERE linked_from = ? AND linked_to = ?", accountNumberFrom, accountNumberTo, (err, row) => {
										if (err) {
											console.error(err);
										}
										if (row) {
											return interaction.reply({ content: "These accounts are already linked; no changes were made.", ephemeral: true });
										} else {
											if (accountNumberFrom == accountNumberTo) {
												return interaction.reply({ content: "An account cannot forward alerts to itself.", ephemeral: true });
											}
											db.run("INSERT INTO links (linked_from, linked_to, discord_id) VALUES (?, ?, ?)", accountNumberFrom, accountNumberTo, interaction.user.id, (err) => {
												if (err) {
													console.error(err);
												} else {
													return interaction.reply({ content: "Alert forwarding enabled successfully.", ephemeral: true });
												}
											});
										}
									});

								} else {
									return interaction.reply({ content: "You don't own that account.", ephemeral: true });
								}
							});
						} else {
							return interaction.reply({ content: "You don't own that account.", ephemeral: true });
						}
					});
					break;
				case "unlink-account": // Unlink two account numbers, only allow unlinking if both accounts are owned by the user
					// check that from and to are owned by the user, and linked, if they are, delete the row
					accountNumberFrom = interaction.options.getString("from");
					accountNumberTo = interaction.options.getString("to");
					db.get("SELECT * FROM accounts WHERE discord_id = ? AND id = ?", interaction.user.id, accountNumberFrom, (err, row) => {
						if (err) {
							console.error(err);
						} else if (row) {
							db.get("SELECT * FROM accounts WHERE discord_id = ? AND id = ?", interaction.user.id, accountNumberTo, (err, row) => {
								if (err) {
									console.error(err);
								} else if (row) {
									db.run("DELETE FROM links WHERE linked_from = ? AND linked_to = ?", accountNumberFrom, accountNumberTo, (err) => {
										if (err) {
											console.error(err);
										} else {
											return interaction.reply({ content: "Alert forwarding disabled successfully.", ephemeral: true });
										}
									});
								} else {
									return interaction.reply({ content: "You don't own that account.", ephemeral: true });
								}
							});
						} else {
							return interaction.reply({ content: "You don't own that account.", ephemeral: true });
						}
					});
					break;
				case "account-links": // a list of linked accounts owned by the user
					// get all linked accounts owned by the user
					db.all("SELECT * FROM links WHERE discord_id = ?", interaction.user.id, (err, rows) => {
						if (err) {
							console.error(err);
						} else if (rows) {
							let linkList = "";
							rows.forEach((row) => {
								linkList += `\`${row.linked_from}\` ➡ \`${row.linked_to}\`\n`;
							});
							interaction.reply({
								content: `Your alert-forwarding links:\n${linkList}`,
								ephemeral: true
							});
						} else {
							interaction.reply({ content: "No alert-forwarding links are configured for your accounts.", ephemeral: true });
						}
					});
					break;
				case "set-voice":
					accountNumber = interaction.options.getString("account_number");
					db.get("SELECT * FROM accounts WHERE id = ?;", accountNumber, (err, row) => {
						if (err) {
							console.error(err)
						} else if (row) {
							newVoice = interaction.options.getString("voice")
							if (!ttsCommands[newVoice]) return interaction.reply({ content: "That voice option is not available. Please choose one of the listed voices.", ephemeral: true });
							console.log(newVoice)
							db.run("UPDATE accounts SET ttsOverride = ? WHERE id = ?", newVoice, accountNumber, (row, err) => {
								if (err) {
									console.error(err)
									return interaction.reply({ content: "An error occured, Contact system administrator", ephemeral: true });
								}
								return interaction.reply({ content: "Alert voice updated successfully.", ephemeral: true })
							})
						}
					})
					break;
			}
			break;
		case Discord.InteractionType.ApplicationCommandAutocomplete:
			// Get all active accounts owned by the user
			db.all("SELECT * FROM accounts WHERE discord_id = ? AND verified = 1", interaction.user.id, (err, rows) => {
				if (err) {
					console.error(err);
				} else if (rows) {
					let accountList = [];
					rows.forEach((row) => {
						accountList.push({
							name: `${row.id} - ${row.phone}`,
							value: `${row.id}`
						});
					});
					interaction.respond(accountList);
				}
			});
	}
});



};