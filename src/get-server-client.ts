
import * as utils from "./utils";
import { ServerClient } from "./server-client";
import type * as types from './types';

let serverClient: types.ServerClient | null = null;

export default function getServerClient(
    apiKey?: string, 
    apiBaseUrl?: string
) : types.ServerClient 
{
    if (!serverClient) {
        if (!apiKey) {
            if (process.env.LIVE_INFERENCE_API_KEY) {
                apiKey = process.env.LIVE_INFERENCE_API_KEY;
            } else {
                throw new Error("LIVE_INFERENCE_API_KEY is not set");
            }
        }
        if (!apiBaseUrl) {
            if (process.env.LIVE_INFERENCE_API_URL) {
                apiBaseUrl = process.env.LIVE_INFERENCE_API_URL;
            } else if (process.env.NEXT_PUBLIC_LIVE_INFERENCE_API_URL) {
                apiBaseUrl = process.env.NEXT_PUBLIC_LIVE_INFERENCE_API_URL;
            }
        }
        if (apiBaseUrl) {
            utils.setApiBaseUrl(apiBaseUrl);
        }
        serverClient = new ServerClient({ apiKey });
    }
    return serverClient as types.ServerClient;
}
