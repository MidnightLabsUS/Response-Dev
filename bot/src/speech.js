const {runCommand}=require("./runtime");
function sanitizeForTTS(input) {
	// Remove any HTML tags and other potentially dangerous characters
	let sanitized = input.replace(/<[^>]*>?/gm, "");  // Remove HTML tags
	sanitized = sanitized.replace(/[^\w\s,.!?'-]/g, "");  // Allow only basic punctuation and word characters

	// Replace multiple spaces with a single space
	sanitized = sanitized.replace(/\s\s+/g, " ");

	// Trim extra whitespace from the beginning and end
	sanitized = sanitized.trim();

	// Optionally, you could replace or normalize abbreviations
	sanitized = sanitized.replace(/\bMr\.\b/g, "Mister");
	sanitized = sanitized.replace(/\bMrs\.\b/g, "Misses");
	sanitized = sanitized.replace(/\bDr\.\b/g, "Doctor");
	sanitized = sanitized.replace(/\bSt\.\b/g, "Saint");

	// Additional logic can go here (e.g., profanity filtering, replacing unsupported characters)

	return sanitized;
}
function buildAlertSpeech(event, location, zoneNumber, zoneName) {
	return sanitizeForTTS(ttsMessage.template.replace("{event}", event).replace("{location}", location).replace("{zone}", [zoneNumber, zoneName].filter(Boolean).join(" ")));
}
function withRepeatPrompt(input){return sanitizeForTTS(input);}
module.exports={sanitizeForTTS,buildAlertSpeech,withRepeatPrompt};