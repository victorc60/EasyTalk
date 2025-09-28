# Daily Word Game Participation Tracking

This feature tracks user participation in the daily word game and provides statistics to administrators.

## Features

### 1. Participation Tracking
- Records when users receive the daily word game
- Tracks whether users answered or not
- Records correct/incorrect answers
- Measures response time
- Awards points for correct answers

### 2. Statistics & Notifications
- Automatic notification to admin after each game session
- Manual statistics check via `/word_stats` command
- Detailed participation metrics
- Leaderboard for daily game participants

### 3. Database Schema
New table: `word_game_participation`
- `id`: Primary key
- `user_id`: Reference to users table
- `game_date`: Date of the game
- `word`: The word of the day
- `answered`: Boolean - did user answer
- `correct`: Boolean - was answer correct
- `points_earned`: Points awarded
- `response_time`: Time taken to answer (milliseconds)

## Usage

### Automatic Notifications
- Statistics are automatically sent to admin 6 minutes after each word game broadcast
- Includes participation rates, accuracy, and top performers

### Manual Statistics
- Use `/word_stats` command to get current day's statistics
- Only available to administrators

### Commands
- `/word_stats` - Get daily word game statistics (admin only)

## Implementation Details

### Files Added/Modified

#### New Files:
- `models/WordGameParticipation.js` - Database model for tracking participation
- `services/wordGameServices.js` - Service functions for participation tracking
- `features/wordGameNotifications.js` - Notification functions for statistics

#### Modified Files:
- `handlers/commandHandlers.js` - Added participation tracking to callback handler
- `features/botFeatures.js` - Added tracking to word game broadcast
- `botSetup.js` - Added `/word_stats` command
- `index.js` - Import new model for database initialization

### Key Functions

#### `recordWordGameParticipation(userId, word, answered, correct, pointsEarned, responseTime)`
Records a user's participation in the daily word game.

#### `getDailyWordGameStats(date)`
Gets comprehensive statistics for a specific date.

#### `notifyDailyWordGameStats(bot, date)`
Sends formatted statistics to the admin.

#### `scheduleWordGameStatsNotification(bot, delayMinutes)`
Schedules automatic notification after game timeout.

## Statistics Provided

- Total participants who received the game
- Number who answered vs didn't answer
- Participation percentage
- Number of correct answers
- Overall accuracy rate
- Total points earned
- Top 5 performers with points

## Example Notification

```
📊 Статистика ежедневной игры со словами
📅 Дата: 2024-01-15

👥 Участие:
• Всего получили игру: 150
• Ответили: 89
• Не ответили: 61
• Процент участия: 59%

🎯 Результаты:
• Правильных ответов: 67
• Точность: 75%
• Всего очков заработано: 670

🏆 Топ-5 участников:
1. @username1 - 10 очков
2. @username2 - 10 очков
3. @username3 - 10 очков
4. @username4 - 10 очков
5. @username5 - 10 очков
```
