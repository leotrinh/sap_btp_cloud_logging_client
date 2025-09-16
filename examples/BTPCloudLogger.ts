import { createLogger } from 'sap-btp-cloud-logging-client';
export function getCloudLogger(): any  {
    try {
        //Leo: using default instance with env value maintenance 
        const btpCloudLogger = createLogger();
        if(!btpCloudLogger){
            throw new Error(`Can't get BTP Cloud Logging Client instance`); 
        }
        return btpCloudLogger;
    } catch (error) {
        console.log(`get BTP Cloud Logging Client instance error: ${error.message ?? 'N\A'}`);
        throw new Error(`Can't get BTP Cloud Logging Client instance`); 
    }
}