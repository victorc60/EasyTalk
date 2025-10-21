# 🎧 Voice Storytelling Feature

## Overview
The Voice Storytelling feature allows users to generate humorous short stories using ChatGPT and convert them to audio using OpenAI's Text-to-Speech API. Users can listen to engaging stories while practicing their English.

## Features

### 📚 Story Generation
- **AI-Powered Stories**: Uses ChatGPT (GPT-4) to generate humorous and engaging short stories
- **Multiple Topics**: Choose from predefined topics or let the AI surprise you
- **Customizable Length**: Short (1-2 min), Medium (2-3 min), or Long (3-5 min) stories
- **English Learning Focus**: Stories are designed to be suitable for English learners

### 🎧 Audio Conversion
- **High-Quality TTS**: Uses OpenAI's TTS-1 model with the "alloy" voice
- **MP3 Format**: Stories are converted to MP3 audio files for easy listening
- **Automatic Cleanup**: Audio files are automatically deleted after 30 minutes to save space

### 🎮 User Experience
- **Interactive Menu**: Easy-to-use interface with buttons for topic and length selection
- **Points System**: Users earn 10 points for audio stories, 5 points for text-only stories
- **Session Management**: Tracks user selections during story creation process
- **Error Handling**: Graceful fallback to text-only if audio generation fails

## Usage

### Commands
- `/story` - Start the voice storytelling feature
- `/story [topic]` - Generate a story with a specific topic

### Example Topics
- Adventure
- Comedy
- Animals
- Technology
- Travel
- Food
- Sports
- Music
- Art
- Nature
- Friendship
- Surprise me!

## Technical Implementation

### Files Added
1. **`services/storyService.js`** - Core service for story generation and TTS
2. **`handlers/storyHandlers.js`** - Command and callback handlers for the feature
3. **`test_story_feature.js`** - Test script to verify functionality

### Files Modified
1. **`botSetup.js`** - Added story command registration and callback handling
2. **`handlers/commandHandlers.js`** - Added story feature to welcome message

### Dependencies Used
- **OpenAI API**: For both story generation (ChatGPT) and text-to-speech conversion
- **Node.js File System**: For temporary audio file management
- **Telegram Bot API**: For sending audio files and handling user interactions

## Configuration

### Environment Variables Required
- `OPENAI_API_KEY` - OpenAI API key for ChatGPT and TTS access

### Directory Structure
```
EasyTalk/
├── services/
│   └── storyService.js
├── handlers/
│   └── storyHandlers.js
├── temp/                    # Temporary audio files (auto-created)
├── test_story_feature.js    # Test script
└── VOICE_STORY_FEATURE.md   # This documentation
```

## Features in Detail

### Story Generation Process
1. User selects topic and length preferences
2. ChatGPT generates a humorous story based on the criteria
3. Story is formatted and validated
4. Text-to-speech conversion creates MP3 audio
5. Both text and audio are sent to the user
6. Temporary files are cleaned up automatically

### Error Handling
- **API Failures**: Graceful fallback to text-only stories
- **File System Issues**: Automatic cleanup and error reporting
- **Session Timeouts**: Automatic cleanup of inactive user sessions
- **Audio Generation Failures**: Fallback to text-only delivery

### Performance Optimizations
- **Temporary File Management**: Audio files are automatically deleted after 30 minutes
- **Session Cleanup**: Inactive user sessions are cleaned up regularly
- **Async Processing**: Non-blocking story generation and audio conversion
- **Memory Management**: Proper cleanup of file buffers and resources

## Testing

Run the test script to verify the feature works correctly:
```bash
node test_story_feature.js
```

The test will:
1. Generate a simple story
2. Create a story with audio
3. Verify file cleanup
4. Report success/failure status

## Future Enhancements

### Potential Improvements
- **Multiple Voices**: Support for different TTS voices (echo, fable, onyx, nova, shimmer)
- **Story Categories**: More specific story types (horror, romance, mystery)
- **User Preferences**: Save favorite topics and voice preferences
- **Story History**: Track and replay previously generated stories
- **Custom Prompts**: Allow users to provide their own story prompts
- **Multi-language Support**: Generate stories in different languages
- **Audio Effects**: Add background music or sound effects

### Integration Opportunities
- **Word Game Integration**: Use stories to introduce new vocabulary
- **Progress Tracking**: Track story consumption as learning activity
- **Social Features**: Share favorite stories with other users
- **Scheduled Stories**: Daily story recommendations

## Troubleshooting

### Common Issues
1. **Audio Generation Fails**: Check OpenAI API key and quota limits
2. **File Permission Errors**: Ensure temp directory is writable
3. **Memory Issues**: Monitor disk space for temporary audio files
4. **API Rate Limits**: Implement proper rate limiting for high usage

### Monitoring
- Check console logs for story generation success/failure
- Monitor temp directory size and cleanup frequency
- Track user engagement with story feature analytics
- Monitor OpenAI API usage and costs

## Support

For issues or questions about the Voice Storytelling feature:
1. Check the console logs for error messages
2. Verify OpenAI API key configuration
3. Test with the provided test script
4. Check temp directory permissions and disk space
