export async function acknowledgeCallback(bot, queryId, options = {}) {
  try {
    await bot.answerCallbackQuery(queryId, options);
    return true;
  } catch (error) {
    const description = error?.response?.body?.description || error.message || '';
    if (!/query is too old|query ID is invalid|response timeout expired/i.test(description)) {
      console.warn('Callback acknowledgement failed:', description);
    }
    return false;
  }
}
