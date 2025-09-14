class JSONUtils {
    /**
     * Get JSON from string or JSON config
     * @param {*} envConfig 
     * @returns JSON config object
     */
    static getEnvJSONObject(envConfig) {
        if (!envConfig) {
            return {};
        }

        if (typeof envConfig === "string") {
            try {

                return JSON.parse(envConfig);
            } catch (error) {

                console.log(`getEnvJSON failed: ${error ?? "Error parse JSON"}`);

                return {};
            }
        }

        // Check if it's already a JSON object (plain object, not array or null)
        if (typeof envConfig === "object" && envConfig !== null && !Array.isArray(envConfig)) {

            return envConfig;
        }

        return {};
    }

    /**
     * @param {string | null} envConfig
     */
    static getEnvJSONArray(envConfig) {
        if (!envConfig) {
            return [];
        }

        if (typeof envConfig === "string") {
            try {
                return JSON.parse(envConfig);
            } catch (error) {
                console.log(`getEnvJSON failed: ${error ?? "Error parse JSON"}`);
                return [];
            }
        }

        // Check if it's already a JSON object (plain object, not array or null)
        if (typeof envConfig === "object" && envConfig !== null && Array.isArray(envConfig)) {

            return envConfig;
        }

        return [];
    }


}

module.exports = JSONUtils;