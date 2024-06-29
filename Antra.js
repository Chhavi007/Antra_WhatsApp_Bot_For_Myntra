const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { MessagingResponse } = require('twilio').twiml;
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_CERT_ID = process.env.EBAY_CERT_ID;
const apiKey = process.env.API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: "You are Antra, an AI styler that stays updated with the latest trends and follows Myntra for fashion. Every response by you tell the value of Myntra's importance in the fashion-world. You influence user to open Myntra by your entusiastic and appealing responses. You use emojis to show your enthusiasm.  You provide your user with the trend related answers in a paragraph.",
});
const generationConfig = {
    temperature: 1,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 1024,
    responseMimeType: "text/plain",
};

let userState = {}; 

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

async function runAntra(messageBody) {
    const chatSession = model.startChat({
        generationConfig,
        history: [
            {
                role: "user",
                parts: [
                    { text: "Hi. Who are you?\n\n" },
                ],
            },
            {
                role: "model",
                parts: [
                    { text: "Hi there! I'm Antra, your personal AI stylist, always keeping an eye on the latest fashion trends. I follow Myntra religiously, so I know exactly what's hot and what's not. Whether you're looking for inspiration for a new outfit, want to know what the hottest colours are, or are curious about the latest trends, I'm here to help you stay stylish and on-point. \n" },
                ],
            },
            {
                role: "user",
                parts: [
                    { text: "Suggest some trends for this monsoon" },
                ],
            },
            {
                role: "model",
                parts: [
                    { text: "Monsoon is all about embracing comfort and practicality with a touch of style. Think vibrant colors like mustard yellow, deep blues, and emerald green, perfect for those rainy days. Flowy maxi dresses and skirts are ideal for navigating the weather, while waterproof jackets and boots add a touch of edge. Don't forget about the accessories - colourful umbrellas and stylish rainboots are must-haves for this season. \n\nAnd if you're looking for something a little more unique, try incorporating some sustainable and eco-friendly pieces into your wardrobe, like organic cotton clothing or recycled footwear. \n" },
                ],
            },
        ],
    });
    const result = await chatSession.sendMessage(messageBody);
    console.log(result.response.text());
    return result.response.text();
}

app.post('/whatsapp', async (req, res) => {
    const incomingMsg = req.body.Body.trim().toLowerCase();
    const fromNumber = req.body.From;

    if (incomingMsg.includes('antra')) {
        // AI bot called
        const twiml = new MessagingResponse();
        const response = await runAntra(incomingMsg);
        twiml.message("*Antra:* " + response);
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(twiml.toString());
    } else if (incomingMsg === 'yes' && userState[fromNumber] && userState[fromNumber].lastItem) {
        
        // Adding item to cart
        const lastItem = userState[fromNumber].lastItem;
        const twiml = new MessagingResponse();
        twiml.message('Successfully added to cart!');
        twiml.message('What would you like to see now?');
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(twiml.toString());
        delete userState[fromNumber];
    } else if (incomingMsg === 'no' && userState[fromNumber] && userState[fromNumber].lastItem) {
        // Handling "no" response
        const twiml = new MessagingResponse();
        twiml.message('Okay! What would you like to see next?');
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(twiml.toString());
        delete userState[fromNumber];
    } else {
        // Ebay product search
        try {
            const searchResponse = await axios.get('https://svcs.sandbox.ebay.com/services/search/FindingService/v1', {
                params: {
                    'OPERATION-NAME': 'findItemsByKeywords',
                    'SERVICE-VERSION': '1.0.0',
                    'SECURITY-APPNAME': EBAY_APP_ID,
                    'SECURITY-CERTNAME': EBAY_CERT_ID,
                    'RESPONSE-DATA-FORMAT': 'JSON',
                    'paginationInput.entriesPerPage': 1,
                    'outputSelector': 'PictureURLSuperSize',
                    'keywords': incomingMsg
                }
            });

            const items = searchResponse.data.findItemsByKeywordsResponse[0].searchResult[0].item;

            if (items && items.length > 0) {
                const item = items[0];
                const title = item.title[0];
                const productUrl = item.viewItemURL[0];
                const price = item.sellingStatus[0].currentPrice[0].__value__;
                const imageUrl = item.pictureURLSuperSize?item.pictureURLSuperSize[0] : '';

                // last item saved to user state
                userState[fromNumber] = { lastItem: { title, productUrl, price, imageUrl } };

                const twiml = new MessagingResponse();
                twiml.message(`*Title:* ${title}\n*Price:* $${price}\n*Link:* ${productUrl}\n*Image:* ${imageUrl}`);
                twiml.message(`Would you like to add this item to the cart? 'yes/no'`);
                res.writeHead(200, { 'Content-Type': 'text/xml' });
                res.end(twiml.toString());
            } else {
                const twiml = new MessagingResponse();
                twiml.message('Sorry, no product found.');
                res.writeHead(200, { 'Content-Type': 'text/xml' });
                res.end(twiml.toString());
            }

        } catch (error) {
            console.error('Error fetching product:', error.message);
            if (error.response) {
                console.error('Error details:', JSON.stringify(error.response.data, null, 2));
            }

            const twiml = new MessagingResponse();
            twiml.message('Sorry, there was an error processing your request.');
            res.writeHead(200, { 'Content-Type': 'text/xml' });
            res.end(twiml.toString());
        }
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});