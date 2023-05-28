import { lambdaHandler } from '../../app';
import { ScheduledEvent, Context } from 'aws-lambda';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

import { mockClient } from 'aws-sdk-client-mock';
import eventJson from '../../../events/event.json';
import axios from 'axios';
import fs from 'fs';

const TABLE_NAME = 'WatcherMessage';
const mockDocumentClient = mockClient(DynamoDBDocumentClient);
jest.mock('axios');
afterEach(() => {
    mockDocumentClient.reset();
});

test('When message is not changed from the previous message in ddb, it should skip LINE push and ddb put.', async () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const event: ScheduledEvent = {
        ...eventJson,
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const context: Context = {};

    // Mocking DynamoDB calls
    mockDocumentClient.on(GetCommand).resolves({
        Item: {
            id: 'previousMessage',
            message: 'Downloads: 100000, Rating: 5',
        },
    });
    mockDocumentClient.on(PutCommand).resolves({});

    const mockResponse = { data: fs.readFileSync('./tests/unit/jetbrains-response.xml') };
    const jetBrainsApiMock = jest.spyOn(axios, 'get');
    jetBrainsApiMock.mockResolvedValueOnce(mockResponse);

    await lambdaHandler(event, context);

    // Check DynamoDB calls
    expect(mockDocumentClient.commandCalls(GetCommand).length).toBe(1);
    expect(
        mockDocumentClient.commandCalls(
            GetCommand,
            {
                TableName: TABLE_NAME,
                Key: { id: 'previousMessage' },
            },
            true,
        ).length,
    ).toBe(1);
    expect(mockDocumentClient.commandCalls(PutCommand).length).toBe(0);

    // Check axios get request was called correctly
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get).toHaveBeenCalledWith('https://plugins.jetbrains.com/plugins/list?pluginId=19099');
});
