# Daily Word Game Timing Changes

## Changes Made

### 1. Extended Game Duration
- **Before**: Word games had a 5-minute timeout
- **After**: Word games run until the end of the day (23:59:59 Moscow time)
- **Configuration**: Set `WORD_GAME_TIMEOUT` to `null` to disable fixed timeout

### 2. Automatic Statistics Notification
- **Before**: Statistics were sent 6 minutes after game broadcast
- **After**: Statistics are automatically sent at 00:05 Moscow time (5 minutes after midnight)
- **New Configuration**: Added `WORD_GAME_STATS_TIME: { hour: 0, minute: 5, tz: 'Europe/Moscow' }`

### 3. End-of-Day Cleanup
- **New Feature**: Automatic cleanup of any remaining active games at midnight
- **Behavior**: Users who haven't answered by midnight get the correct answer and their participation is recorded
- **Message**: "🌙 День закончился!" instead of "⏰ Время вышло!"

## Technical Implementation

### Configuration Changes (`config.js`)
```javascript
WORD_GAME_STATS_TIME: { hour: 0, minute: 5, tz: 'Europe/Moscow' }, // Stats at 00:05
WORD_GAME_TIMEOUT: null, // Disable fixed timeout
```

### Scheduler Updates (`botSetup.js`)
- Added midnight scheduler for statistics notification
- Integrated end-of-day cleanup with statistics sending
- Removed old timeout-based scheduling

### Game Logic Updates (`features/botFeatures.js`)
- Dynamic timeout calculation based on time until midnight
- Different timeout behavior when `WORD_GAME_TIMEOUT` is null
- Updated timeout messages for end-of-day scenario

### New Functions (`features/wordGameNotifications.js`)
- `handleEndOfDayWordGames()`: Processes remaining active games at midnight
- Enhanced error handling and logging
- Automatic cleanup of game sessions

## User Experience Changes

### For Players
- **More Time**: Players have until the end of the day to answer
- **Better Messages**: Clear indication when the day ends vs. timeout
- **Consistent Experience**: Games end at the same time daily

### For Admin
- **Scheduled Reports**: Automatic statistics every day at 00:05
- **Complete Data**: Statistics include all participants from the full day
- **Reliable Timing**: No dependency on game broadcast time

## Timeline Example

**Day 1:**
- 18:30 Moscow: Word game broadcast starts
- 18:30-23:59: Players can answer anytime
- 00:00 Moscow: End of day
- 00:05 Moscow: Admin receives statistics for Day 1

**Day 2:**
- 18:30 Moscow: New word game broadcast
- Process repeats...

## Benefits

1. **Better User Experience**: More time to participate
2. **Consistent Reporting**: Daily statistics at fixed time
3. **Complete Data**: Full day participation tracking
4. **Automatic Cleanup**: No manual intervention needed
5. **Reliable Scheduling**: Independent of game broadcast times

## Commands Available

- `/word_stats` - Manual statistics check (admin only)
- `/test_admin` - Test admin messaging functionality

The system now provides a more user-friendly experience with extended participation time and reliable daily statistics reporting.
