import { ScheduledEvent, Context } from 'aws-lambda';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { Plugin } from './types'; // import the type from types.ts
import AWS from 'aws-sdk';

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = 'WatcherMessage';

const fetchLatestPlugin = async (): Promise<Plugin> => {
    const jetBrainsUrl = 'https://plugins.jetbrains.com/plugins/list?pluginId=19099';

    const jetBrainsResponse = await axios.get(jetBrainsUrl);
    const xmlParser = new XMLParser({ ignoreAttributes: false });
    const xmlJson = xmlParser.parse(jetBrainsResponse.data);
    console.log(`DEBUG xmlJson: ${JSON.stringify(xmlJson)}`);
    const plugins: Plugin[] = xmlJson['plugin-repository'].category['idea-plugin'];

    return plugins.reduce((prev: Plugin, current: Plugin) => {
        return prev['@_date'] > current['@_date'] ? prev : current;
    });
};

const getStoredMessage = async (): Promise<any> => {
    const params: AWS.DynamoDB.DocumentClient.GetItemInput = {
        TableName: TABLE_NAME,
        Key: { id: 'previousMessage' },
    };

    const response = await dynamodb.get(params).promise();
    return response.Item;
};

const storeMessage = async (message: string) => {
    const params: AWS.DynamoDB.DocumentClient.PutItemInput = {
        TableName: TABLE_NAME,
        Item: {
            id: 'previousMessage',
            message,
        },
    };

    await dynamodb.put(params).promise();
};

const isMessageChanged = (previousMessage: string, message: string): boolean => {
    return !previousMessage || message !== previousMessage;
};

const is10AMNow = (): boolean => {
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();

    // Check if the current time is between 10:00 AM and 10:05 AM JST
    return currentHour === 10 && currentMinute >= 0 && currentMinute <= 5;
};

const sendLineMessage = async (message: string) => {
    const lineUrl = 'https://api.line.me/v2/bot/message/push';
    const lineAccessToken = process.env.LINE_ACCESS_TOKEN;
    const lineUserId = process.env.LINE_USER_ID;

    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lineAccessToken}`,
    };

    const data = {
        to: lineUserId,
        messages: [
            {
                type: 'text',
                text: message,
            },
        ],
    };

    const lineResponse = await axios.post(lineUrl, data, { headers });
    console.log(`DEBUG lineResponse.data: ${JSON.stringify(lineResponse.data)}`);
};

export const lambdaHandler = async (event: ScheduledEvent, context: Context) => {
    console.log(`DEBUG event: ${JSON.stringify(event)}`);
    console.log(`DEBUG context: ${JSON.stringify(context)}`);

    try {
        const latestPlugin = await fetchLatestPlugin();
        const message = `Downloads: ${latestPlugin['@_downloads']}, Rating: ${latestPlugin.rating}`;
        console.log(`DEBUG message: ${message}`);

        const storedMessage = await getStoredMessage();
        const previousMessage = storedMessage ? storedMessage.message : undefined;

        if (isMessageChanged(previousMessage, message) || is10AMNow()) {
            await sendLineMessage(message);
        }
        if (isMessageChanged(previousMessage, message)) {
            await storeMessage(message);
        }
    } catch (error) {
        console.error(error);
    }
};
