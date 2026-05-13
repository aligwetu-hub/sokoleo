const { query } = require('../db/pool');
const { notifyListingCreated } = require('./smsService');

// ── Session helpers ────────────────────────────────────────────────

async function getSession(sessionId, phone) {
  const res = await query(
    `INSERT INTO ussd_sessions (session_id, phone, state, data)
     VALUES ($1, $2, 'MAIN_MENU', '{}')
     ON CONFLICT (session_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [sessionId, phone]
  );
  return res.rows[0];
}

async function updateSession(sessionId, state, data) {
  await query(
    `UPDATE ussd_sessions SET state=$1, data=$2, updated_at=NOW() WHERE session_id=$3`,
    [state, JSON.stringify(data), sessionId]
  );
}

async function clearSession(sessionId) {
  await query(`DELETE FROM ussd_sessions WHERE session_id=$1`, [sessionId]);
}

// ── USSD response helpers ──────────────────────────────────────────

const CON = (text) => `CON ${text}`;
const END = (text) => `END ${text}`;

// ── Main handler ───────────────────────────────────────────────────

async function handleUSSD({ sessionId, serviceCode, phoneNumber, text }) {
  // Normalize phone
  const phone = phoneNumber.replace(/^\+/, '');
  const input = text || '';
  const parts = input.split('*');
  const lastInput = parts[parts.length - 1];

  let session = await getSession(sessionId, phone);
  const state = session.state;
  const data = session.data || {};

  // ── MAIN MENU ────────────────────────────────────────────────────
  if (input === '') {
    await updateSession(sessionId, 'MAIN_MENU', {});
    return CON(
      `Welcome to SokoLeo 🌽\n` +
      `1. Sell Produce\n` +
      `2. Buy Produce\n` +
      `3. Farm Tours\n` +
      `4. My Listings\n` +
      `5. Help`
    );
  }

  // ── SELL PRODUCE ─────────────────────────────────────────────────
  if (parts[0] === '1') {
    if (parts.length === 1) {
      await updateSession(sessionId, 'SELL_PRODUCT', {});
      return CON(
        `Select product to sell:\n` +
        `1. Maize\n2. Beans\n3. Green Grams\n4. Millet\n5. Mangoes\n6. Goats\n7. Other`
      );
    }

    const products = ['Maize', 'Beans', 'Green Grams', 'Millet', 'Mangoes', 'Goats'];

    if (parts.length === 2) {
      const idx = parseInt(parts[1]) - 1;
      const product = idx < 6 ? products[idx] : null;
      if (parts[1] === '7' || !product) {
        await updateSession(sessionId, 'SELL_PRODUCT_OTHER', {});
        return CON(`Enter your product name:`);
      }
      await updateSession(sessionId, 'SELL_QTY', { product });
      return CON(`Enter quantity of ${product}\n(e.g. 10 bags, 5 kg):`);
    }

    if (parts.length === 3) {
      const productName = data.product || products[(parseInt(parts[1]) - 1)] || 'Other';
      await updateSession(sessionId, 'SELL_LOCATION', { ...data, product: productName, quantity: parts[2] });
      return CON(`Enter your location:\n(e.g. Marimanti, Kathwana):`);
    }

    if (parts.length === 4) {
      await updateSession(sessionId, 'SELL_AVAILABILITY', { ...data, location: parts[3] });
      return CON(
        `When is it available?\n1. Today\n2. Tomorrow\n3. This Week`
      );
    }

    if (parts.length === 5) {
      const avMap = { '1': 'today', '2': 'tomorrow', '3': 'this_week' };
      const availability = avMap[parts[4]] || 'this_week';
      const { product, quantity, location } = data;

      try {
        // Find or register user
        let userRes = await query(`SELECT id FROM users WHERE phone=$1`, [phone]);
        let userId;

        if (userRes.rows.length === 0) {
          // Auto-register as farmer on first use
          const newUser = await query(
            `INSERT INTO users (phone, name, role, location) VALUES ($1, $2, 'farmer', $3) RETURNING id`,
            [phone, `Farmer ${phone.slice(-4)}`, location]
          );
          userId = newUser.rows[0].id;
          await query(`INSERT INTO farmers (user_id) VALUES ($1)`, [userId]);
        } else {
          userId = userRes.rows[0].id;
        }

        await query(
          `INSERT INTO listings (farmer_id, product, quantity, location, availability)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, product, quantity, location, availability]
        );

        await notifyListingCreated(`0${phone.slice(-9)}`, product, quantity, location);
        await clearSession(sessionId);

        return END(
          `✅ Listing saved!\n` +
          `${product} - ${quantity}\n` +
          `Location: ${location}\n` +
          `Buyers will contact you soon.`
        );
      } catch (err) {
        console.error('USSD sell error:', err.message);
        return END(`❌ Error saving listing. Please try again.`);
      }
    }
  }

  // ── BUY PRODUCE ──────────────────────────────────────────────────
  if (parts[0] === '2') {
    if (parts.length === 1) {
      return CON(
        `What do you want to buy?\n` +
        `1. Maize\n2. Beans\n3. Green Grams\n4. Millet\n5. Mangoes\n6. Goats`
      );
    }

    if (parts.length === 2) {
      const products = ['Maize', 'Beans', 'Green Grams', 'Millet', 'Mangoes', 'Goats'];
      const product = products[parseInt(parts[1]) - 1];
      if (!product) return END(`Invalid choice. Dial *789# to try again.`);

      const listings = await query(
        `SELECT l.id, l.quantity, l.location, u.name, u.phone
         FROM listings l JOIN users u ON l.farmer_id = u.id
         WHERE LOWER(l.product) = LOWER($1) AND l.status = 'active'
         ORDER BY l.created_at DESC LIMIT 5`,
        [product]
      );

      if (listings.rows.length === 0) {
        return END(`No ${product} available right now.\nCheck again later or call 0700000000.`);
      }

      await updateSession(sessionId, 'BUY_CHOOSE', { product, listings: listings.rows });

      let menu = `Available ${product}:\n`;
      listings.rows.forEach((l, i) => {
        menu += `${i + 1}. ${l.name} – ${l.quantity} – ${l.location}\n`;
      });
      menu += `\nSelect to contact:`;
      return CON(menu);
    }

    if (parts.length === 3) {
      const listings = data.listings || [];
      const chosen = listings[parseInt(parts[2]) - 1];
      if (!chosen) return END(`Invalid choice. Please try again.`);

      await updateSession(sessionId, 'BUY_ACTION', { ...data, chosen });
      return CON(
        `${data.product} from ${chosen.name}\n` +
        `Qty: ${chosen.quantity} | ${chosen.location}\n\n` +
        `1. Call Farmer\n2. Reserve Stock`
      );
    }

    if (parts.length === 4) {
      const { chosen, product } = data;
      if (parts[3] === '1') {
        await clearSession(sessionId);
        return END(`Call ${chosen.name}: ${chosen.phone}\nMention SokoLeo when calling.`);
      }
      if (parts[3] === '2') {
        // Create reservation
        try {
          let traderRes = await query(`SELECT id FROM users WHERE phone=$1`, [phone]);
          let traderId;
          if (traderRes.rows.length === 0) {
            const newUser = await query(
              `INSERT INTO users (phone, name, role) VALUES ($1, $2, 'trader') RETURNING id`,
              [phone, `Trader ${phone.slice(-4)}`]
            );
            traderId = newUser.rows[0].id;
            await query(`INSERT INTO traders (user_id) VALUES ($1)`, [traderId]);
          } else {
            traderId = traderRes.rows[0].id;
          }

          await query(
            `INSERT INTO reservations (listing_id, trader_id, status) VALUES ($1, $2, 'pending')`,
            [chosen.id, traderId]
          );

          await clearSession(sessionId);
          return END(
            `✅ Reservation placed!\n` +
            `${product} from ${chosen.name}\n` +
            `Farmer will confirm soon.\nContact: ${chosen.phone}`
          );
        } catch (err) {
          console.error('Reservation error:', err.message);
          return END(`❌ Could not place reservation. Try again.`);
        }
      }
    }
  }

  // ── FARM TOURS ───────────────────────────────────────────────────
  if (parts[0] === '3') {
    if (parts.length === 1) {
      const tours = await query(
        `SELECT ft.id, ft.farm_type, ft.price, ft.location, u.name, u.phone
         FROM farm_tours ft JOIN users u ON ft.farmer_id = u.id
         WHERE ft.status='active' LIMIT 5`
      );

      if (tours.rows.length === 0) {
        return END(`No farm tours listed yet.\nCheck again later!`);
      }

      await updateSession(sessionId, 'TOURS_LIST', { tours: tours.rows });
      let menu = `Available Farm Tours:\n`;
      tours.rows.forEach((t, i) => {
        menu += `${i + 1}. ${t.farm_type} – KES ${t.price} – ${t.location}\n`;
      });
      menu += `\nSelect to book:`;
      return CON(menu);
    }

    if (parts.length === 2) {
      const tours = data.tours || [];
      const tour = tours[parseInt(parts[1]) - 1];
      if (!tour) return END(`Invalid choice.`);
      await clearSession(sessionId);
      return END(
        `${tour.farm_type} Farm Tour\n` +
        `Location: ${tour.location}\n` +
        `Price: KES ${tour.price}\n` +
        `Contact: ${tour.name}: ${tour.phone}`
      );
    }
  }

  // ── MY LISTINGS ──────────────────────────────────────────────────
  if (parts[0] === '4') {
    const myListings = await query(
      `SELECT product, quantity, location, status FROM listings
       WHERE farmer_id = (SELECT id FROM users WHERE phone=$1)
       ORDER BY created_at DESC LIMIT 5`,
      [phone]
    );

    if (myListings.rows.length === 0) {
      return END(`You have no listings yet.\nDial *789# > 1 to list produce.`);
    }

    let msg = `Your listings:\n`;
    myListings.rows.forEach((l, i) => {
      msg += `${i + 1}. ${l.product} – ${l.quantity} [${l.status}]\n`;
    });
    await clearSession(sessionId);
    return END(msg);
  }

  // ── HELP ─────────────────────────────────────────────────────────
  if (parts[0] === '5') {
    await clearSession(sessionId);
    return END(
      `SokoLeo Help\n` +
      `Sell: *789# > 1\n` +
      `Buy: *789# > 2\n` +
      `Tours: *789# > 3\n` +
      `Support: 0700-SOKOLEO\n` +
      `Works on any phone!`
    );
  }

  // Fallback
  await clearSession(sessionId);
  return END(`Invalid option. Dial *789# to start again.`);
}

module.exports = { handleUSSD };
