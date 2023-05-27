import { ScheduledEvent, Context } from 'aws-lambda';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

import { Plugin } from './types'; // import the type from types.ts

const fetchLatestPluginDownloads = async (): Promise<number> => {
    const jetBrainsUrl = 'https://plugins.jetbrains.com/plugins/list?pluginId=19099';

    const jetBrainsResponse = await axios.get(jetBrainsUrl);
    const xmlParser = new XMLParser();
    const jsonObj = xmlParser.parse(jetBrainsResponse.data);
    const plugins: Plugin[] = jsonObj['plugin-repository'].category[0]['idea-plugin'];

    const latestPlugin = plugins.reduce((prev: Plugin, current: Plugin) => {
        return prev.$attrs.date > current.$attrs.date ? prev : current;
    });

    return latestPlugin.$attrs.downloads;
};

const sendLineMessage = async (message: string) => {
    const lineUrl = 'https://api.line.me/v2/bot/message/push';
    const lineAccessToken = 'Your LINE Access Token'; // Replace with your LINE access token

    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lineAccessToken}`,
    };

    const data = {
        to: 'Your LINE User ID', // Replace with your LINE User ID
        messages: [
            {
                type: 'text',
                text: message,
            },
        ],
    };

    const lineResponse = await axios.post(lineUrl, data, { headers });

    return lineResponse.data;
};

export const handler = async (event: ScheduledEvent, context: Context) => {
    try {
        const latestDownloads = await fetchLatestPluginDownloads();
        console.log(`Latest downloads: ${latestDownloads}`);

        const message = `Latest downloads: ${latestDownloads}`;
        await sendLineMessage(message);
    } catch (error) {
        console.error(error);
    }
};
