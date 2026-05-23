require('dotenv').config();

let AT;
try {
  const AfricasTalking = require('africastalking');
  AT = AfricasTalking({
    apiKey:   process.env.AT_API_KEY   || 'test',
    username: process.env.AT_USERNAME  || 'sandbox',
  });
} catch (e) {
  console.warn("Africa's Talking SDK not loaded — SMS will be mocked.");
}

const sms = AT ? AT.SMS : null;

async function sendSMS(phone, message) {
  try {
    let formatted = String(phone).replace(/\s/g, '');
    if (formatted.startsWith('0'))       formatted = '+254' + formatted.slice(1);
    else if (!formatted.startsWith('+')) formatted = '+254' + formatted;

    const apiKey = process.env.AT_API_KEY;
    const isMockKey = !apiKey || apiKey === 'your_key' || apiKey === 'test';

    if (!sms || process.env.NODE_ENV !== 'production' || isMockKey) {
      console.log(`[SMS MOCK] To: ${formatted}\n${message}\n`);
      return { success: true, mock: true, simulated: true };
    }

    const result = await sms.send({
      to:      [formatted],
      message,
      from:    process.env.AT_SENDER_ID || 'SokoLeo',
    });
    console.log('SMS sent:', JSON.stringify(result));
    return { success: true, result };
  } catch (err) {
    console.error('SMS error:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Templates (Swahili/English mix, 160-char friendly) ───────────────────────

const SMS_TEMPLATES = {

  newOffer: (farmerName, produce, offerPrice, traderName) =>
    `SokoLeo: Habari ${farmerName}! Trader ${traderName} amekupeleka offer ya KES ${offerPrice}/kg kwa ${produce} yako. Ingia sokoleo.onrender.com kukagua. Soko Kila Siku!`,

  offerAccepted: (traderName, produce, price, farmerName) =>
    `SokoLeo: Hongera ${traderName}! Farmer ${farmerName} amekubali offer yako ya KES ${price}/kg kwa ${produce}. Ingia sokoleo.onrender.com kukamilisha deal. Soko Kila Siku!`,

  offerRejected: (traderName, produce, farmerName) =>
    `SokoLeo: Pole ${traderName}. Farmer ${farmerName} amekataa offer yako kwa ${produce}. Jaribu tena na bei nyingine. sokoleo.onrender.com`,

  offerCountered: (traderName, produce, counterPrice, farmerName) =>
    `SokoLeo: ${traderName}, Farmer ${farmerName} amekupa counter offer ya KES ${counterPrice}/kg kwa ${produce}. Ingia sokoleo.onrender.com kukubaliana. Soko Kila Siku!`,

  newListing: (farmerName, produce, price, location) =>
    `SokoLeo: Listing mpya! ${farmerName} ana ${produce} @ KES ${price}/kg - ${location}. Tembelea sokoleo.onrender.com kununua. Soko Kila Siku!`,

  escrowPaid: (farmerName, produce, amount, buyerName) =>
    `SokoLeo: ${farmerName}, ${buyerName} amelipa KES ${amount} kwa ${produce} yako. Pesa iko salama escrow. Toa mali na upokee malipo yako. sokoleo.onrender.com`,

  escrowReleased: (farmerName, amount) =>
    `SokoLeo: Hongera ${farmerName}! KES ${amount} imetumwa kwa M-PESA yako. Asante kwa kutumia SokoLeo. Soko Kila Siku!`,

  newMessage: (receiverName, senderName) =>
    `SokoLeo: ${receiverName}, una ujumbe mpya kutoka ${senderName}. Ingia sokoleo.onrender.com kujibu. Soko Kila Siku!`,

  listingBoosted: (farmerName, produce, hours) =>
    `SokoLeo: ${farmerName}, listing yako ya ${produce} imeboostwa kwa masaa ${hours}! Traders wengi wataona listing yako kwanza. Soko Kila Siku!`,

  newReview: (farmerName, rating, traderName) =>
    `SokoLeo: ${farmerName}, ${traderName} amekupa rating ya ${rating} nyota! Angalia review yako kwenye sokoleo.onrender.com`,

  welcomeFarmer: (name) =>
    `SokoLeo: Karibu ${name}! Umejisajili kama Farmer. Anza kuorodhesha mazao yako leo. sokoleo.onrender.com - Soko Kila Siku!`,

  welcomeTrader: (name) =>
    `SokoLeo: Karibu ${name}! Umejisajili kama Trader. Anza kununua mazao bora leo. sokoleo.onrender.com - Soko Kila Siku!`,
};

module.exports = { sendSMS, SMS_TEMPLATES };
