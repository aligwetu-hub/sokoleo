async function initiateSTKPush(phone, amount, accountRef, description) {
  console.log(`[M-Pesa MOCK] STK Push to ${phone} for KES ${amount} | Ref: ${accountRef}`);
  return { success: true, mock: true, CheckoutRequestID: `mock_${Date.now()}` };
}
function parseCallback(body) {
  const stk = body && body.Body && body.Body.stkCallback;
  if (!stk) return null;
  return { success: stk.ResultCode === 0, checkoutRequestId: stk.CheckoutRequestID, resultDesc: stk.ResultDesc };
}
module.exports = { initiateSTKPush, parseCallback };
