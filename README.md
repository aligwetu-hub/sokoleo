# 🌽 SokoLeo — Rural Agricultural Marketplace

> Digital marketplace for farmers, traders and farm tourism in **Tharaka Nithi County, Kenya**

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
cd sokoleo
npm install
```

### 2. Set up environment
```bash
cp .env.example .env
# Edit .env with your real credentials
```

### 3. Set up PostgreSQL database
```bash
# Create DB first:
createdb sokoleo

# Run schema:
npm run init-db
```

### 4. Start the server
```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Server runs on **http://localhost:4000**  
Admin Dashboard: **http://localhost:4000**

---

## 📡 API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register farmer/trader/visitor |
| POST | `/api/auth/otp/send` | Send OTP to phone |
| POST | `/api/auth/otp/verify` | Verify OTP |
| GET | `/api/auth/user/:phone` | Get user profile |

### Listings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/listings?product=Maize&location=Marimanti` | Search produce |
| POST | `/api/listings` | Create listing |
| PATCH | `/api/listings/:id/status` | Update status |
| DELETE | `/api/listings/:id` | Delete listing |

### Reservations
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/reservations` | Reserve produce |
| POST | `/api/reservations/:id/pay` | Initiate M-Pesa STK |
| GET | `/api/reservations/trader/:phone` | Trader's reservations |

### Farm Tours
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tours` | List all tours |
| POST | `/api/tours` | Create tour listing |
| POST | `/api/tours/:id/book` | Book a tour |

### USSD & Payments (Callbacks)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ussd` | Africa's Talking USSD callback |
| POST | `/api/payments/mpesa/callback` | M-Pesa Daraja callback |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/stats` | Dashboard stats |
| GET | `/api/admin/users` | All users |
| PATCH | `/api/admin/users/:id/verify` | Verify user |
| GET | `/api/admin/listings` | All listings |

---

## 📱 USSD Flow (*789#)

```
*789#
├── 1. Sell Produce
│   └── Select product → Enter qty → Enter location → Availability → SAVED ✅
├── 2. Buy Produce
│   └── Select product → See farmers → Call / Reserve
├── 3. Farm Tours
│   └── See available tours → Book
├── 4. My Listings
│   └── View your active listings
└── 5. Help
```

---

## 🔧 Africa's Talking Setup (USSD + SMS)

1. Create account at [africastalking.com](https://africastalking.com)
2. Create a USSD shortcode (e.g. `*789#`) in sandbox
3. Set callback URL: `https://your-domain.com/api/ussd`
4. Add your `AT_USERNAME` and `AT_API_KEY` to `.env`

---

## 💳 M-Pesa Daraja Setup

1. Register at [developer.safaricom.co.ke](https://developer.safaricom.co.ke)
2. Create app, get Consumer Key & Secret
3. Get your Lipa Na M-Pesa passkey
4. Set callback URL: `https://your-domain.com/api/payments/mpesa/callback`
5. Fill `MPESA_*` values in `.env`

---

## 🌍 Deployment (Render.com — Free Tier)

1. Push to GitHub
2. Create new **Web Service** on Render
3. Set environment variables from `.env.example`
4. Add PostgreSQL database add-on
5. Deploy!

---

## 📊 Revenue Model

| Source | Amount |
|--------|--------|
| Trader Basic subscription | KES 500/month |
| Trader Pro subscription | KES 1,000/month |
| Trader Bulk subscription | KES 2,000/month |
| Reservation fee | KES 50–100 |
| Farm tour commission | 10% per booking |

---

## 🗺️ Target Region
**Tharaka Nithi County, Kenya** — initially covering Marimanti, Kathwana, Chuka markets.
