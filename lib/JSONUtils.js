class JSONUtils {
  /**
   * Get JSON from string or JSON config
   * @param {string | object | null | undefined} envConfig 
   * @returns {Record<string, any>} JSON config object
   */
  static getEnvJSONObject(envConfig) {
    if (!envConfig) {
      return {};
    }

    if (typeof envConfig === 'string') {
      try {
        return JSON.parse(envConfig);
      } catch (error) {
        /* eslint no-console: ["error", { allow: ["warn", "error","info"] }] */
        console.error(`getEnvJSON failed: ${error ?? 'Error parse JSON'}`);
        return {};
      }
    }

    // Leo: Check if it's already a JSON object (plain object, not array or null)
    if (typeof envConfig === 'object' && envConfig !== null && !Array.isArray(envConfig)) {
      return envConfig;
    }

    return {};
  }
}

module.exports = JSONUtils;