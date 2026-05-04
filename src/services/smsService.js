require('dotenv').config();

async function sendSMS(to, message) {
  const recipients = Array.isArray(to) ? to : [to];
  console.log(`[SMS] To: ${recipients.join(', ')}\nMessage: ${message}\n`);
  return { success: true, mock: true };
}

async function notifyListingCreated(phone, product, quantity, location) {
  return sendSMS(phone, `SokoLeo: Listing created!\nProduct: ${product}\nQty: ${quantity}\nLocation: ${location}`);
}
async function notifyReservationToFarmer(phone, traderName, product, quantity) {
  return sendSMS(phone, `SokoLeo: New reservation!\n${traderName} wants ${quantity} of your ${product}.`);
}
async function notifyReservationToTrader(phone, farmerName, farmerPhone, product, quantity) {
  return sendSMS(phone, `SokoLeo: Reservation confirmed!\nFarmer: ${farmerName} - ${farmerPhone}\nProduct: ${product}, Qty: ${quantity}`);
}
async function notifyPaymentConfirmed(phone, amount, ref) {
  return sendSMS(phone, `SokoLeo: Payment of KES ${amount} received. Ref: ${ref}`);
}
async function notifyNewProduce(phones, product, quantity, location, farmerPhone) {
  return sendSMS(phones, `SokoLeo Alert: New ${product} - ${quantity} in ${location}. Call: ${farmerPhone}`);
}
async function notifyTourBooked(phone, visitorName, date, count) {
  return sendSMS(phone, `SokoLeo: Farm tour booked!\nVisitor: ${visitorName}\nDate: ${date}\nGroup: ${count}`);
}

module.exports = { sendSMS, notifyListingCreated, notifyReservationToFarmer, notifyReservationToTrader, notifyPaymentConfirmed, notifyNewProduce, notifyTourBooked };
