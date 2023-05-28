import { ScheduledEvent, Context } from 'aws-lambda';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { Plugin } from './types';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const dbClient = new DynamoDBClient({
    endpoint: process.env.ENV === 'local' ? 'http://host.docker.internal:8000' : undefined,
});
const documentClient = DynamoDBDocumentClient.from(dbClient);
const TABLE_NAME = 'WatcherMessage';

const getStoredMessage = async (): Promise<any> => {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'previousMessage' },
    });
    const response = await documentClient.send(command);
    return response.Item;
};

const storeMessage = async (message: string) => {
    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            id: 'previousMessage',
            message,
        },
    });
    await documentClient.send(command);
};

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

async function buildNewMessage() {
    const latestPlugin = await fetchLatestPlugin();
    return `Downloads: ${latestPlugin['@_downloads']}, Rating: ${latestPlugin.rating}`;
}

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
        const storedMessage = await getStoredMessage();
        console.log(`DEBUG storedMessage: ${JSON.stringify(storedMessage)}`);
        const previousMessage = storedMessage ? storedMessage.message : undefined;

        const newMessage = await buildNewMessage();
        console.log(`DEBUG newMessage: ${newMessage}`);

        if (isMessageChanged(previousMessage, newMessage) || is10AMNow()) {
            await sendLineMessage(newMessage);
        }
        if (isMessageChanged(previousMessage, newMessage)) {
            await storeMessage(newMessage);
        }
    } catch (error) {
        console.error(error);
    }
};
