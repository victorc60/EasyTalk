// fix_whisper.js - Script to manually add "whisper" to used words history
import { addWordToUsedHistory } from './content/contentGenerators.js';

console.log('🔧 Adding "whisper" to used words history...');
addWordToUsedHistory('whisper');
console.log('✅ Done! "whisper" has been added to the used words history.');
console.log('🔄 Restart your bot to see the changes take effect.');
