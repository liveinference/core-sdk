
// api base url
//
const api_base_url = 'https://api.liveinference.com';

// options 16000, 22050, 24000, 44100, 48000
// 22050 is the default sample rate, other sample rates are not tested
//
const sampleRate = 22050;                        // Hz

// live inference api path
//
const apiPath = '/api/v1/inference/stream';

const moduleUrl = 'https://cdn.doitincloud.com/live-inference/worklet/v1.0.0/worklet.js';

// for voice and video recording
//
const recordingInterval = 3000;                    // milliseconds

export {
    api_base_url,
    sampleRate,
    apiPath,
    moduleUrl,
    recordingInterval
};

export default {
    api_base_url,
    sampleRate,
    apiPath,
    moduleUrl,
    recordingInterval
};
