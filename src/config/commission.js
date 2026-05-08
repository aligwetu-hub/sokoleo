// src/config/commission.js
// SokoLeo Commission Structure
// Buyer pays extra on top of listing price
// Seller pays % deducted from their payout

const COMMISSION = {
  // Category rates
  rates: {
    livestock:    { buyer: 0.05, seller: 0.01 }, // 5% + 1%
    vegetables:   { buyer: 0.03, seller: 0.01 }, // 3% + 1%
    fruits:       { buyer: 0.03, seller: 0.01 },
    tubers:       { buyer: 0.03, seller: 0.01 },
    cereals:      { buyer: 0.03, seller: 0.01 },
    farm_inputs:  { buyer: 0.02, seller: 0.01 },
    services:     { buyer: 0,    seller: 0,
                    listing_fee: 500, per_deal: 200 },
    default:      { buyer: 0.03, seller: 0.01 },
  },

  // Calculate commission for a transaction
  calculate(amount, category = 'default') {
    const rate = this.rates[category] || this.rates.default;
    const buyerFee    = Math.round(amount * rate.buyer);
    const sellerFee   = Math.round(amount * rate.seller);
    const totalEarned = buyerFee + sellerFee;
    return {
      listing_price:   amount,
      buyer_pays:      amount + buyerFee,
      seller_receives: amount - sellerFee,
      buyer_fee:       buyerFee,
      seller_fee:      sellerFee,
      sokoleo_earns:   totalEarned,
      buyer_rate:      rate.buyer,
      seller_rate:     rate.seller,
    };
  },

  // Map listing category to commission category
  getCategory(categoryStr = '') {
    const c = categoryStr.toLowerCase();
    if (c.includes('livestock') || c.includes('animal') || c.includes('dog'))
      return 'livestock';
    if (c.includes('vegetable') || c.includes('veg'))
      return 'vegetables';
    if (c.includes('fruit'))
      return 'fruits';
    if (c.includes('tuber') || c.includes('potato'))
      return 'tubers';
    if (c.includes('cereal') || c.includes('pulse') || c.includes('grain'))
      return 'cereals';
    if (c.includes('input') || c.includes('byproduct') || c.includes('manure'))
      return 'farm_inputs';
    if (c.includes('service'))
      return 'services';
    return 'default';
  }
};

module.exports = COMMISSION;
