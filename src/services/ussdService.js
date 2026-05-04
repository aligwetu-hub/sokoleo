const db = require('../db/client');
const { notifyListingCreated } = require('./smsService');

const CON = t => `CON ${t}`;
const END = t => `END ${t}`;

async function handleUSSD({ sessionId, phoneNumber, text }) {
  const phone = phoneNumber.replace(/^\+/, '');
  const parts = (text || '').split('*');

  if (!text) {
    return CON(`Welcome to SokoLeo\n1. Sell Produce\n2. Buy Produce\n3. Farm Tours\n4. My Listings\n5. Help`);
  }

  // SELL
  if (parts[0] === '1') {
    if (parts.length === 1) return CON(`Select product:\n1. Maize\n2. Beans\n3. Green Grams\n4. Millet\n5. Mangoes\n6. Goats`);
    if (parts.length === 2) return CON(`Enter quantity (e.g. 10 bags):`);
    if (parts.length === 3) return CON(`Enter your location:`);
    if (parts.length === 4) return CON(`Availability?\n1. Today\n2. Tomorrow\n3. This Week`);
    if (parts.length === 5) {
      const products = ['Maize','Beans','Green Grams','Millet','Mangoes','Goats'];
      const product = products[parseInt(parts[1])-1] || 'Other';
      const quantity = parts[2];
      const location = parts[3];
      const avMap = {'1':'today','2':'tomorrow','3':'this_week'};
      const availability = avMap[parts[4]] || 'this_week';
      try {
        let u = await db.query('SELECT id FROM users WHERE phone=$1',[phone]);
        let userId;
        if (!u.rows.length) {
          const nu = await db.query(`INSERT INTO users (phone,name,role,location) VALUES ($1,$2,'farmer',$3) RETURNING id`,[phone,`Farmer${phone.slice(-4)}`,location]);
          userId = nu.rows[0].id;
          await db.query('INSERT INTO farmers (user_id) VALUES ($1)',[userId]);
        } else { userId = u.rows[0].id; }
        await db.query(`INSERT INTO listings (farmer_id,product,quantity,location,availability) VALUES ($1,$2,$3,$4,$5)`,[userId,product,quantity,location,availability]);
        await notifyListingCreated(phone, product, quantity, location);
        return END(`Listing saved!\n${product} - ${quantity}\nLocation: ${location}\nBuyers will contact you.`);
      } catch(e) { return END('Error saving listing. Try again.'); }
    }
  }

  // BUY
  if (parts[0] === '2') {
    if (parts.length === 1) return CON(`What to buy?\n1. Maize\n2. Beans\n3. Green Grams\n4. Millet\n5. Mangoes\n6. Goats`);
    if (parts.length === 2) {
      const products = ['Maize','Beans','Green Grams','Millet','Mangoes','Goats'];
      const product = products[parseInt(parts[1])-1];
      if (!product) return END('Invalid choice. Dial *789# again.');
      const r = await db.query(`SELECT l.id,l.quantity,l.location,u.name,u.phone FROM listings l JOIN users u ON l.farmer_id=u.id WHERE LOWER(l.product)=LOWER($1) AND l.status='active' LIMIT 5`,[product]);
      if (!r.rows.length) return END(`No ${product} available now.`);
      let menu = `Available ${product}:\n`;
      r.rows.forEach((l,i) => menu += `${i+1}. ${l.name} - ${l.quantity} - ${l.location}\n`);
      return CON(menu + '\nSelect:');
    }
    return END('Thank you for using SokoLeo!');
  }

  // HELP
  if (parts[0] === '5') return END(`SokoLeo Help\nSell: *789*1#\nBuy: *789*2#\nSupport: 0700000000`);

  return END('Invalid option. Dial *789# to start.');
}

module.exports = { handleUSSD };
