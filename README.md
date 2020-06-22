# SpChat
Chat relay service that can be used to integrate Bright Pattern Call Center with several chat providers - VKontakte, Telegram, Viber, Facebook (current version no longer works), WeChat, WhatsApp (via Infobip).

##Configure

Application uses 3 environment variables to start:

```sh
SPCHAT_CONFIG_PATH — path to configuration file (see below)
PORT  — port used by server
WEB_URL  — server url
```

###Configuration File
```json
{
    "spchat": {
        "apps": {
            "app1": {
                "appId": "<SP App ID>",
                "tenant": "<SP Tenant URL>",
                "host": "<SP Hostname>",
                "ssl": <true | false>
            }
        },
        "routes": {
            "default": "app1"
        }
    },

    <Configuration specific to Chat Provider>,

    "messages": {
        "___FILL_FORM":     "+ Please fill out this form: {{url}}",
        "___CHAT_ENDED":    "+ Chat ended",
        "___PARTY_JOINED":  "+ {{name}} joined the chat",
        "___PARTY_LEFT":    "+ {{name}} left the chat",
        "___SEND_LOCATION": "+ Please send your location",
        "___CHAT_STATUS":   "+ Chat status: {{status}}, EWT: {{ewt}}",
        "___CHAT_MESSAGE":  "{{name}}: {{message}}"
    }
}
```

###VK Configuration
```json
    "vk": {
        "groupAccessToken": <VK Group Access Token>,
        "adminUserLogin": <VK Admin User Login>,
        "adminUserPassword": <VK Admin User Password>,
        "groupId": <VK Group ID>,
        "confirmationCode": <VK Confirmation Code>
    }
```
###Telegram Configuration
```json
   "telegram":{
       "comment": <an optional comment string>,
       "token": <Telegram token>
   }
```

###Viber Configuration
```json
    "vb": {
        "authToken": <Viber auth token>,
        "name": <Viber account name>,
        "avatarUrl": <Viber avatar URL>
    }
```

###Facebook Configuration
```json
    "fb":{
        "verifyToken": <FB verify token>,
        "pageAccessToken": <FB page access token>
    },
```

###WeChat Configuration
```json
   "wc": {
        "appId": <WeChat app ID>,
        "appSecret": <WeChat app secret>
    }
```

###WhatsApp Configuration (via Infobip)
```json
   "wa": {
        "scenarioKey": <Infobip scenario key>,
        "apiBaseUrl": <Infobip base URL>,
        "apiKey": <Infobip API URL>
    }
```
