# errors/ — 错误翻译层

所有底层异常必须经 `translateToBusinessError` 转为 `BusinessError`
（`code`、`userMessage`、`category`、`retryable`）后再返回客户端，
禁止外泄 `ECONNREFUSED`、调用栈等原始信息。
