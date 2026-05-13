// Commission rates for SokoLeo marketplace (all amounts in KES)

const CATEGORIES = {
  produce:   { buyer_rate: 0.03, seller_rate: 0.03, label: 'Produce'   },
  livestock: { buyer_rate: 0.04, seller_rate: 0.03, label: 'Livestock' },
  tours:     { buyer_rate: 0.05, seller_rate: 0.05, label: 'Farm Tour' },
  services:  { buyer_rate: 0.05, seller_rate: 0.05, label: 'Services'  },
};

const DEFAULT_CATEGORY = 'produce';

function getCategory(name) {
  const key = (name || '').toLowerCase();
  return CATEGORIES[key] ? key : DEFAULT_CATEGORY;
}

function calculate(listingPrice, categoryKey) {
  const cat = CATEGORIES[categoryKey] || CATEGORIES[DEFAULT_CATEGORY];
  const buyerFee   = Math.round(listingPrice * cat.buyer_rate  * 100) / 100;
  const sellerFee  = Math.round(listingPrice * cat.seller_rate * 100) / 100;
  return {
    listing_price:  listingPrice,
    buyer_rate:     cat.buyer_rate,
    seller_rate:    cat.seller_rate,
    buyer_fee:      buyerFee,
    seller_fee:     sellerFee,
    buyer_pays:     Math.round((listingPrice + buyerFee) * 100) / 100,
    seller_receives: Math.round((listingPrice - sellerFee) * 100) / 100,
    sokoleo_earns:  Math.round((buyerFee + sellerFee) * 100) / 100,
  };
}

module.exports = { CATEGORIES, getCategory, calculate };
