/** Acceptance-test navigation/sign-in only. Never wrap financial writes.
 * Retry only connection resets/network changes. HTTP and assertion failures pass through. */
export async function retryBrowserTransport(operation, onRetry) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (
        attempt >= 2 ||
        !/ECONNRESET|ERR_NETWORK_CHANGED|ERR_CONNECTION_RESET/.test(String(error.message))
      )
        throw error;
      onRetry?.();
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}
