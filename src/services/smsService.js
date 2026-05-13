require('dotenv').config();

let AT;
try {
  const AfricasTalking = require('africastalking');
  AT = AfricasTalking({
    username: process.env.AT_USERNAME || 'sandbox',
    apiKey: process.env.AT_API_KEY || 'test',
  });
} catch (e) {
  console.warn('Africa\'s Talking SDK not loaded — SMS will be mocked.');
}

const sms = AT ? AT.SMS : null;

/**
 * Send an SMS message
 * @param {string|string[]} to - Phone number(s) in format +254XXXXXXXXX
 * @param {string} message
 */
async function sendSMS(to, message) {
  const recipients = Array.isArray(to) ? to : [to];
  const formatted = recipients.map(p => p.startsWith('+') ? p : `+${p.replace(/^0/, '254')}`);

  if (!sms || process.env.NODE_ENV !== 'production') {
    console.log(`[SMS MOCK] To: ${formatted.join(', ')}\nMessage: ${message}\n`);
    return { success: true, mock: true };
  }

  try {
    const result = await sms.send({
      to: formatted,
      message,
      from: process.env.AT_SENDER_ID || 'SokoLeo',
    });
    return { success: true, result };
  } catch (err) {
    console.error('SMS send error:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Notification templates ─────────────────────────────────────────

async function notifyListingCreated(farmerPhone, product, quantity, location) {
  return sendSMS(farmerPhone,
    `SokoLeo: Listing created!\nProduct: ${product}\nQty: ${quantity}\nLocation: ${location}\nBuyers will contact you soon.`
  );
}

async function notifyReservationToFarmer(farmerPhone, traderName, product, quantity) {
  return sendSMS(farmerPhone,
    `SokoLeo: New reservation!\n${traderName} wants to reserve ${quantity} of your ${product}.\nPlease confirm via *789#`
  );
}

async function notifyReservationToTrader(traderPhone, farmerName, farmerPhone2, product, quantity) {
  return sendSMS(traderPhone,
    `SokoLeo: Reservation confirmed!\nFarmer: ${farmerName}\nProduct: ${product}, Qty: ${quantity}\nContact farmer: ${farmerPhone2}`
  );
}

async function notifyPaymentConfirmed(phone, amount, reference) {
  return sendSMS(phone,
    `SokoLeo: Payment of KES ${amount} received.\nRef: ${reference}\nThank you for using SokoLeo!`
  );
}

async function notifyNewProduce(subscriberPhones, product, quantity, location, farmerPhone) {
  return sendSMS(subscriberPhones,
    `SokoLeo Alert: New ${product} available!\nQty: ${quantity} in ${location}\nCall farmer: ${farmerPhone}`
  );
}

async function notifyTourBooked(farmerPhone, visitorName, visitDate, visitorCount) {
  return sendSMS(farmerPhone,
    `SokoLeo: Farm tour booked!\nVisitor: ${visitorName}\nDate: ${visitDate}\nGroup size: ${visitorCount}`
  );
}

module.exports = {
  sendSMS,
  notifyListingCreated,
  notifyReservationToFarmer,
  notifyReservationToTrader,
  notifyPaymentConfirmed,
  notifyNewProduce,
  notifyTourBooked,
};
