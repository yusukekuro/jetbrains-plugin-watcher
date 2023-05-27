import { ScheduledEvent, Context } from 'aws-lambda';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

import { Plugin } from './types'; // import the type from types.ts

const fetchLatestPluginDownloads = async (): Promise<number> => {
    const jetBrainsUrl = 'https://plugins.jetbrains.com/plugins/list?pluginId=19099';

    const jetBrainsResponse = await axios.get(jetBrainsUrl);
    const xmlParser = new XMLParser({ ignoreAttributes: false });
    const xmlJson = xmlParser.parse(jetBrainsResponse.data);
    console.log(`DEBUG xmlJson: ${JSON.stringify(xmlJson)}`);
    const plugins: Plugin[] = xmlJson['plugin-repository'].category['idea-plugin'];

    const latestPlugin = plugins.reduce((prev: Plugin, current: Plugin) => {
        return prev['@_date'] > current['@_date'] ? prev : current;
    });

    return latestPlugin['@_downloads'];
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
        const latestDownloads = await fetchLatestPluginDownloads();
        const message = `Latest downloads: ${latestDownloads}`;
        console.log(`DEBUG message: ${message}`);
        await sendLineMessage(message);
    } catch (error) {
        console.error(error);
    }
};
