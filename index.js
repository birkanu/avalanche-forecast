// IMPORTS
const Alexa = require('ask-sdk-core');
const persistenceAdapter = require('ask-sdk-s3-persistence-adapter');
const axios = require('axios');
const cheerio = require('cheerio');
const chrono = require('chrono-node');
const dateToWords = require('date-to-words');
const _ = require('lodash'); 

// CONSTANTS 
const NAME = 'name';
const STATE = 'state';
const DANGER_LEVEL = 'danger_level';
const TRAVEL_ADVICE = 'travel_advice';
const DANGER = 'danger';
const LINK = 'link';

const NO_RATING = -1;
const LOW = 1;
const MODERATE = 2; 
const CONSIDERABLE = 3;
const HIGH = 4;
const EXTREME = 5;

const FORECAST_BY_REGION = 'forecastByRegion';
const FORECASTS_BY_STATE = 'forecastsByState';
const LAST_UPDATED_DATE = 'lastUpdatedDate';
const FORECAST = 'forecast';
const FORECASTS = 'forecasts';

const AVALANCHE_ORG_URL = 'http://avalanche.org/wp-admin/admin-ajax.php?action=map_layer';
const AVALANCHE_ORG_INTENT_ERROR = 'I am having trouble getting the latest avalanche forecast. Please try again later.';
const BOTTOM_LINE_ERROR = "I can't get the latest bottom line right now. You can try again later.";

const LAUNCH_SPEECH_TEXT = 'Welcome to Avalanche Forecast! I can tell you the latest avalanche information in the United States. ' +
'To learn what you can ask me, say "help". You can also check the instructions in the Alexa app under the Avalanche Forecast skill ' +
'description.';
const LAUNCH_REPROMPT_TEXT = 'Hi there! I can tell you the latest avalanche forecast. Ask away!';
const HELP_SPEECH_TEXT = 'I can help you with three things. <break time="500ms"/> First, I can tell you the danger rating and travel ' +
'advice for a region in the US. For example, you can just say "What is the avalanche forecast in Stevens Pass?" or "Conditions in ' +
'Mount Shasta". <break time="500ms"/> Second, I can give you a summary of the avalanche forecast in your state while telling you where ' +
'the lowest danger is. Just ask: "Where can I go in Utah? or "What is the latest forecast in Montana?".<break time="500ms"/> Finally, ' +
'you can ask me what the bottom line is for regions <emphasis level="moderate">only</emphasis> in Washington state. Just say "Bottom ' +
'line for Snoqualmie Pass".';

var ERROR_MESSAGES = [
    "Hmmm.  I can't seem to figure that one out.",
    "There's a chance I misunderstood you, but I don't know how to answer your question.",
    "I'm sorry. I don't know how to help you with that."
];

const TEN_HOURS_IN_MS = 10 * 60 * 60  * 1000;

// UTILITIES
async function getForecasts() {
    try {
        // Call avalanche.org to get the latest forecast.
        const response = await axios.get(AVALANCHE_ORG_URL);
        // Pick out relevant information from the response, and return forecasts keyed by region and state.
        const forecasts = _(response.data.features).map(feature => ({
            name: feature.properties.name,
            center: feature.properties.center,
            link: feature.properties.link,
            state: feature.properties.state,
            travel_advice: feature.properties.travel_advice,
            danger: feature.properties.danger,
            danger_level: feature.properties.danger_level
        })).value();
        let forecastByRegion = _.keyBy(forecasts, NAME);
        // Remove whitespace from the keys to match slot ID values for regions.
        forecastByRegion = _.mapKeys(forecastByRegion, function(value, key) {
            return key.replace(/\s/g,'');
        });
        const forecastsByState = _.groupBy(forecasts, STATE);
        return { 
            forecastByRegion: forecastByRegion,
            forecastsByState: forecastsByState
        };
    } catch (error) {
        throw error;
    }    
}

function getRandomMessage(messages) {
    const min = 0; 
    const max = messages.length - 1;
    return messages[Math.floor(Math.random() * (max - min + 1) + min)];
}

function jsonStringify(message) {
    return JSON.stringify(message, null, 4);
}

// REQUEST INTERCEPTORS
const GetForecastsRequestInterceptor = {
    async process(handlerInput) {
        // Get the request type and intent name.
        const request = handlerInput.requestEnvelope.request; 
        const requestType = request.type;
        // Only intercept the request to get the forecasts if the request is a forecast intent request.
        if (requestType === 'IntentRequest' && request.intent.name !== 'AMAZON.HelpIntent' && request.intent.name !== 'AMAZON.CancelIntent' && request.intent.name !== 'AMAZON.NavigateHomeIntent'
        && request.intent.name !== 'AMAZON.StopIntent') {
            // Get session attributes from cache.
            const attributesManager = handlerInput.attributesManager;
            const persistentAttributes = await attributesManager.getPersistentAttributes() || {};
            // Get the data from session attributes if it exists. 
            const lastUpdatedDateStr = persistentAttributes.hasOwnProperty(LAST_UPDATED_DATE) ? persistentAttributes[LAST_UPDATED_DATE] : undefined;
            const forecastByRegion = persistentAttributes.hasOwnProperty(FORECAST_BY_REGION) ? persistentAttributes[FORECAST_BY_REGION] : undefined;
            const forecastsByState = persistentAttributes.hasOwnProperty(FORECASTS_BY_STATE) ? persistentAttributes[FORECASTS_BY_STATE] : undefined;
            // If the data has been cached for less than 10 hours and it exists, return it as session attributes.
            const now = new Date();
            if (lastUpdatedDateStr) {
                const lastUpdatedDate = new Date(lastUpdatedDateStr);
                const timeDifferenceInMs = Math.abs(now.getTime() - lastUpdatedDate.getTime());
                if ( (timeDifferenceInMs < TEN_HOURS_IN_MS) && forecastByRegion && forecastsByState ) {
                    let sessionAttributes = {};
                    if (request.intent.name === 'RegionAvalancheForecastIntent' || request.intent.name === 'RegionBottomLineIntent') {
                        const region = handlerInput.requestEnvelope.request.intent.slots.region.resolutions.resolutionsPerAuthority[0].values[0].value.id;
                        const regionName = handlerInput.requestEnvelope.request.intent.slots.region.resolutions.resolutionsPerAuthority[0].values[0].value.name;
                        const forecast = forecastByRegion[region];
                        sessionAttributes[FORECAST] = forecast;
                    } else {
                        const stateAbbreviation = handlerInput.requestEnvelope.request.intent.slots.state.resolutions.resolutionsPerAuthority[0].values[0].value.id;
                        const state = handlerInput.requestEnvelope.request.intent.slots.state.resolutions.resolutionsPerAuthority[0].values[0].value.name;
                        const forecasts = forecastsByState[stateAbbreviation];
                        sessionAttributes[FORECASTS] = forecasts;
                    }
                    attributesManager.setSessionAttributes(sessionAttributes);
                    console.log(`[GetForecastsRequestInterceptor] Data is cached, setting session attributes...`);
                    return;
                }
            }
            // Data doesn't exist or is not up-to-date. Get forecast information from avalanche.org.
            try {
                const forecasts = await getForecasts();
                // Cache forecast information as attributes in S3.
                persistentAttributes[LAST_UPDATED_DATE] = now.toString();
                persistentAttributes[FORECAST_BY_REGION] = forecasts[FORECAST_BY_REGION];
                persistentAttributes[FORECASTS_BY_STATE] = forecasts[FORECASTS_BY_STATE];
                attributesManager.setPersistentAttributes(persistentAttributes);
                await attributesManager.savePersistentAttributes();
                let sessionAttributes = {};
                if (request.intent.name === 'RegionAvalancheForecastIntent' || request.intent.name === 'RegionBottomLineIntent') {
                    const region = handlerInput.requestEnvelope.request.intent.slots.region.resolutions.resolutionsPerAuthority[0].values[0].value.id;
                    const regionName = handlerInput.requestEnvelope.request.intent.slots.region.resolutions.resolutionsPerAuthority[0].values[0].value.name;
                    const forecast = forecastByRegion[region];
                    sessionAttributes[FORECAST] = forecast;
                } else {
                    const stateAbbreviation = handlerInput.requestEnvelope.request.intent.slots.state.resolutions.resolutionsPerAuthority[0].values[0].value.id;
                    const state = handlerInput.requestEnvelope.request.intent.slots.state.resolutions.resolutionsPerAuthority[0].values[0].value.name;
                    const forecasts = forecastsByState[stateAbbreviation];
                    sessionAttributes[FORECASTS] = forecasts;
                }
                attributesManager.setSessionAttributes(sessionAttributes);  
                console.log(`[GetForecastsRequestInterceptor] Data is not cached, fetched forecast data and setting session attributes...`);
            } catch (error) {
                console.log(`[GetForecastsRequestInterceptor] Caught error: ${error}`);
            }
        }
    }
};

// INTENT HANDLERS
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    handle(handlerInput) {
        console.log(`[LaunchRequestHandler] Processing input: ${jsonStringify(handlerInput)}`);
        return handlerInput.responseBuilder.speak(LAUNCH_SPEECH_TEXT).reprompt(LAUNCH_REPROMPT_TEXT).getResponse();
    }
};

const RegionAvalancheForecastIntentHandler = {
    canHandle(handlerInput) { 
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' && handlerInput.requestEnvelope.request.intent.name === 'RegionAvalancheForecastIntent';
    },
    handle(handlerInput) {
        console.log(`[RegionAvalancheForecastIntentHandler] Processing input: ${jsonStringify(handlerInput)}`);
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const forecast = sessionAttributes.hasOwnProperty(FORECAST) ? sessionAttributes[FORECAST] : undefined;
        if (!forecast) {
            console.log(`[RegionAvalancheForecastIntentHandler] Forecast information not present!`);
            return handlerInput.responseBuilder.speak(AVALANCHE_ORG_INTENT_ERROR).getResponse();
        }
        try {
            const region = handlerInput.requestEnvelope.request.intent.slots.region.resolutions.resolutionsPerAuthority[0].values[0].value.id;
            const regionName = handlerInput.requestEnvelope.request.intent.slots.region.value ? handlerInput.requestEnvelope.request.intent.slots.region.value : handlerInput.requestEnvelope.request.intent.slots.region.resolutions.resolutionsPerAuthority[0].values[0].value.name;
            let speechText;
            if ( forecast[DANGER_LEVEL] === NO_RATING ) {
                speechText = 'There is currently no avalanche danger rating for ' + regionName + '. General travel advice is to ' + forecast[TRAVEL_ADVICE];
            } else {
                speechText = 'The avalanche danger for ' + regionName + ' is ' + forecast[DANGER] + '. ' + forecast[TRAVEL_ADVICE];    
            }
            console.log(speechText)
            return handlerInput.responseBuilder.speak(speechText).getResponse();
        } catch (error) {
            console.log(`[RegionAvalancheForecastIntentHandler] Caught error: ${error}`);
            throw error;
        }
    }
};

const StateAvalancheForecastIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' && handlerInput.requestEnvelope.request.intent.name === 'StateAvalancheForecastIntent';
    },
    handle(handlerInput) {
        console.log(`[StateAvalancheForecastIntentHandler] Processing input: ${jsonStringify(handlerInput)}`);
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const forecasts = sessionAttributes.hasOwnProperty(FORECASTS) ? sessionAttributes[FORECASTS] : undefined;
        if (!forecasts) { 
            console.log(`[StateAvalancheForecastIntentHandler] Forecast information not present!`);
            return handlerInput.responseBuilder.speak(AVALANCHE_ORG_INTENT_ERROR).getResponse();
        }
        try {
            const stateAbbreviation = handlerInput.requestEnvelope.request.intent.slots.state.resolutions.resolutionsPerAuthority[0].values[0].value.id;
            const state = handlerInput.requestEnvelope.request.intent.slots.state.resolutions.resolutionsPerAuthority[0].values[0].value.name;
            const forecastsByDangerLevel = _.groupBy(forecasts, 'danger_level');
            if (forecastsByDangerLevel[NO_RATING] && forecastsByDangerLevel[NO_RATING].length ===  forecasts.length) {
                const speechText = `There is currently no avalanche danger rating for the state of ${state}. <break time="500ms"/>` +
                `General travel advice is to ${forecasts[0][TRAVEL_ADVICE]}`;
                return handlerInput.responseBuilder.speak(speechText).getResponse();
            } else if (forecastsByDangerLevel[LOW] && forecastsByDangerLevel[LOW].length > 0) {
                const lowDangerForecasts = forecastsByDangerLevel[LOW];
                let speechText;
                if (lowDangerForecasts.length === 1) {
                    const region = lowDangerForecasts[0];
                    speechText = `The <emphasis level="moderate">only</emphasis> region with low avalanche danger rating in the state of ${state} is ${region[NAME]}. ` +
                    `<break time="500ms"/> ${region[TRAVEL_ADVICE]} Be careful if you are headed to the other regions.`;
                } else if (lowDangerForecasts.length === 2) {
                    const region1 = lowDangerForecasts[0];
                    const region2 = lowDangerForecasts[1];
                    speechText = `Regions ${region1[NAME]} and ${region2[NAME]} have low avalanche danger rating in the state of ${state}.` +
                    `<break time="500ms"/> ${region1[TRAVEL_ADVICE]} Be careful if you are headed to the other regions.`;
                } else {
                    const lastRegion = lowDangerForecasts.pop();
                    const otherRegionsCommaSeparated = lowDangerForecasts.map(item => item.name).join(', ') ;
                    speechText = `Several regions have low avalanche danger rating in ${state}. These are: ${otherRegionsCommaSeparated} and ${lastRegion[NAME]}.` +
                    `<break time="500ms"/> ${lastRegion[TRAVEL_ADVICE]} <break time="500ms"/> Happy shredding!`;
                }
                return handlerInput.responseBuilder.speak(speechText).getResponse();
            } else if (forecastsByDangerLevel[MODERATE] && forecastsByDangerLevel[MODERATE].length > 0) {
                const moderateDangerForecasts = forecastsByDangerLevel[MODERATE];
                let speechText;
                if (moderateDangerForecasts.length === 1) {
                    const region = moderateDangerForecasts[0];
                    speechText = `Currently in ${state}, there are no regions with low avalanche danger rating. However, ${region[NAME]} has a rating of moderate.` +
                    `<break time="500ms"/> ${region[TRAVEL_ADVICE]}`;
                } else if (moderateDangerForecasts.length === 2) {
                    const region1 = moderateDangerForecasts[0];
                    const region2 = moderateDangerForecasts[1];
                    speechText = `Currently in ${state}, there are no regions with low avalanche danger rating, but regions ${region1[NAME]} and ${region2[NAME]} ` +
                    `have an avalanche danger rating of moderate. <break time="500ms"/> ${region1[TRAVEL_ADVICE]}`;
                } else {
                    const lastRegion = moderateDangerForecasts.pop();
                    const otherRegionsCommaSeparated = moderateDangerForecasts.map(item => item.name).join(', ') ;
                    speechText = `No regions with low avalanche danger rating in ${state}. But several regions such as ${otherRegionsCommaSeparated} and ${lastRegion[NAME]} ` +
                    `have a moderate avalanche danger rating. <break time="500ms"/> ${lastRegion[TRAVEL_ADVICE]}`;
                }
                return handlerInput.responseBuilder.speak(speechText).getResponse();
            } else if (forecastsByDangerLevel[CONSIDERABLE] && forecastsByDangerLevel[CONSIDERABLE].length > 0) {
                const considerableDangerForecasts = forecastsByDangerLevel[CONSIDERABLE];
                let speechText;
                if (considerableDangerForecasts.length === 1) {
                    const region = considerableDangerForecasts[0];
                    speechText = `Currently in ${state}, there are no regions with low or moderate avalanche danger rating. However, ${region[NAME]} has a rating of considerable.` +
                    `<break time="500ms"/> ${region[TRAVEL_ADVICE]} Be safe out there!`;
                } else if (considerableDangerForecasts.length === 2) {
                    const region1 = considerableDangerForecasts[0];
                    const region2 = considerableDangerForecasts[1];
                    speechText = `Currently in ${state}, there are no regions with low or moderate avalanche danger rating, but regions ${region1[NAME]} and ${region2[NAME]} ` +
                    `have an avalanche danger rating of considerable. <break time="500ms"/> ${region1[TRAVEL_ADVICE]} Be safe out there!`;
                } else {
                    const lastRegion = considerableDangerForecasts.pop();
                    const otherRegionsCommaSeparated = considerableDangerForecasts.map(item => item.name).join(', ');
                    speechText = `No regions with low avalanche danger rating in ${state}. But several regions such as ${otherRegionsCommaSeparated} and ${lastRegion[NAME]} ` +
                    `have a considerable avalanche danger rating. <break time="500ms"/> ${lastRegion[TRAVEL_ADVICE]} Stay safe!`;
                }
                return handlerInput.responseBuilder.speak(speechText).getResponse();
            } else if (forecastsByDangerLevel[HIGH] && forecastsByDangerLevel[HIGH].length > 0) {
                const highDangerForecasts = forecastsByDangerLevel[HIGH];
                let speechText = `There are <emphasis level="moderate">no regions</emphasis> with low, moderate or considerable avalanche danger rating in the state of ${state}.` +
                `<break time="500ms"/> ${highDangerForecasts[0][TRAVEL_ADVICE]} But hey, you can probably ski inbounds!`;
                return handlerInput.responseBuilder.speak(speechText).getResponse();
            } else {
                const extremeDangerForecasts = forecastsByDangerLevel[EXTREME];
                let speechText;
                if (extremeDangerForecasts) {
                    speechText = `The avalanche danger rating in regions of ${state} is extreme. <break time="500ms"/> ${extremeDangerForecasts[0][TRAVEL_ADVICE]} ` +
                `I'm staying cozy at home, you should too!`;                    
                } else {
                    speechText = `The avalanche danger rating in regions of ${state} is extreme. <break time="500ms"/> I'm staying cozy at home, you should too!`;                       
                }
                return handlerInput.responseBuilder.speak(speechText).getResponse();
            }
        } catch (error) {
            console.log(`[StateAvalancheForecastIntentHandler] Caught error: ${error}`);
            throw error;
        }    
    }
};

const RegionBottomLineIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' && handlerInput.requestEnvelope.request.intent.name === 'RegionBottomLineIntent';
    },
    async handle(handlerInput) {
        console.log(`[RegionBottomLineIntentHandler] Processing input: ${jsonStringify(handlerInput)}`);
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const forecast = sessionAttributes.hasOwnProperty(FORECAST) ? sessionAttributes[FORECAST] : undefined;
        if (!forecast) { 
            console.log(`[RegionBottomLineIntentHandler] Forecast information not present!`);
            return handlerInput.responseBuilder.speak(AVALANCHE_ORG_INTENT_ERROR).getResponse();
        }
        try {
            const region = handlerInput.requestEnvelope.request.intent.slots.region.resolutions.resolutionsPerAuthority[0].values[0].value.id;
            const regionName = handlerInput.requestEnvelope.request.intent.slots.region.value ? handlerInput.requestEnvelope.request.intent.slots.region.value : handlerInput.requestEnvelope.request.intent.slots.region.resolutions.resolutionsPerAuthority[0].values[0].value.name;
            let speechText;
            if (forecast[STATE] === 'WA') {
                try {
                    const link = forecast[LINK];
                    const response = await axios.get(link);
                    const html = response.data;
                    const $ = cheerio.load(html);
                    const bottomLineElement = $('.ForecastProduct_bottomLineText')
                    const dateElement = $('.forecast-date')
                    const date = chrono.parseDate($(dateElement).text()); 
                    const bottomLine = $(bottomLineElement).text()
                    if ( forecast[DANGER_LEVEL] === NO_RATING ) {
                        speechText = `There is currently no avalanche danger rating for ${regionName},` + 
                        ` but the bottom line, issued on ${dateToWords(date)}, is as follows: ${bottomLine}`;
                    } else {
                        speechText = `The avalanche danger for ${regionName} is ${forecast[DANGER]}, and ` +  
                        `the bottom line, issued on ${dateToWords(date)}, is as follows: ${bottomLine}`;
                    }
                } catch (error) {
                    console.log(`[RegionBottomLineIntentHandler] Caught error: ${error}`);
                    return handlerInput.responseBuilder.speak(BOTTOM_LINE_ERROR).getResponse();     
                }
            } else {
                speechText = `I am sorry, but I can only provide bottom line information for regions in <emphasis level="moderate">Washington state</emphasis>.`;
            }
            return handlerInput.responseBuilder.speak(speechText).getResponse();
        } catch (error) {
            console.log(`[RegionBottomLineIntentHandler] Caught error: ${error}`);
            throw error;
        }
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        console.log(`[HelpIntentHandler] Processing input: ${jsonStringify(handlerInput)}`);
        return handlerInput.responseBuilder.speak(HELP_SPEECH_TEXT).reprompt(HELP_SPEECH_TEXT).getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' && 
        (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent' || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent'
        || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.NavigateHomeIntent');
    },
    handle(handlerInput) {
        console.log(`[CancelAndStopIntentHandler] Processing input: ${jsonStringify(handlerInput)}`);
        return handlerInput.responseBuilder.speak('Thank you for using Avalanche Forecast. Goodbye!').getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`[SessionEndedRequestHandler] Processing input: ${jsonStringify(handlerInput)}`);
        return handlerInput.responseBuilder.getResponse();
    }
};

const ErrorHandler = {
    canHandle() { return true; },
    handle(handlerInput, error) {
        console.log(`[ErrorHandler] Caught error: ${error.message}`);
        return handlerInput.responseBuilder.speak(getRandomMessage(ERROR_MESSAGES)).reprompt(getRandomMessage(ERROR_MESSAGES)).getResponse();
    }
};

exports.handler = Alexa.SkillBuilders.custom().withPersistenceAdapter(
    new persistenceAdapter.S3PersistenceAdapter({bucketName:process.env.S3_PERSISTENCE_BUCKET}))
    .addRequestHandlers(
        LaunchRequestHandler,
        RegionAvalancheForecastIntentHandler,
        StateAvalancheForecastIntentHandler,
        RegionBottomLineIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler)
    .addRequestInterceptors(GetForecastsRequestInterceptor)
    .addErrorHandlers(ErrorHandler)
    .lambda();