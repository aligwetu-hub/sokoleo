# SokoLeo MVP Backend

SokoLeo is a rural agriculture marketplace backend supporting:
- Farmer and trader registration
- OTP phone authentication
- Produce listing and search
- Reservation workflow
- USSD listing/search flow
- SMS notification hooks
- M-Pesa payment hooks (mocked integration points)
- Admin analytics

## 1) Stack
- Node.js + Express
- PostgreSQL (`pg`)
- Africa's Talking compatible USSD and SMS callback endpoints

## 2) Project Structure
- `src/app.js`: Express app wiring
- `src/server.js`: server entrypoint
- `src/db/schema.sql`: PostgreSQL schema
- `src/db/repositories.js`: SQL data access
- `src/routes/*`: REST and callback routes
- `src/services/ussdService.js`: USSD menu logic
- `src/services/smsService.js`: SMS provider implementation (Africa's Talking + mock)
- `src/services/paymentService.js`: M-Pesa STK push stub
- `src/middleware/authMiddleware.js`: Bearer token auth + role guard
- `src/middleware/atCallbackAuthMiddleware.js`: Africa's Talking callback verification

## 3) Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
3. Ensure PostgreSQL is running and `DATABASE_URL` is correct.
4. Initialize database schema:
   ```bash
   npm run db:init
   ```
5. Start server:
   ```bash
   npm run dev
   ```

## 4) Africa's Talking Setup
Configure these `.env` values:
- `SMS_PROVIDER=africas_talking`
- `AT_USERNAME` (`sandbox` in test mode)
- `AT_API_KEY` (from Africa's Talking dashboard)
- `AT_SENDER_ID` (optional approved sender ID)
- `AT_BASE_URL=https://api.africastalking.com/version1`

Configure callback URLs on Africa's Talking:
- USSD callback: `POST https://<your-domain>/api/v1/ussd`
- Inbound SMS callback: `POST https://<your-domain>/api/v1/sms/inbound`
- Delivery report callback: `POST https://<your-domain>/api/v1/sms/delivery-report`

## 5) Callback Verification (Africa's Talking)
Optional hardening controls:
- `AT_VERIFY_CALLBACKS=true`
- `AT_ALLOWED_IPS=<comma-separated-ip-list>` (optional)

When enabled, callback routes (`/api/v1/ussd` and `/api/v1/sms/*`) accept requests if either condition is true:
- Request contains valid Africa's Talking credentials matching `AT_USERNAME` and `AT_API_KEY`.
  Accepted header forms:
  - `Authorization: Basic base64(username:apiKey)`
  - `username` + `apiKey` (or `x-username` + `x-api-key`)
- Source IP matches one of `AT_ALLOWED_IPS`.

## 6) Auth Flow (OTP)
1. Register farmer/trader.
2. Request OTP:
   `POST /api/v1/auth/request-otp`
3. Verify OTP:
   `POST /api/v1/auth/verify-otp`
4. Use returned token as:
   `Authorization: Bearer <token>`

## 7) Core API Endpoints
Public:
- `POST /api/v1/auth/register/farmer`
- `POST /api/v1/auth/register/trader`
- `POST /api/v1/auth/request-otp`
- `POST /api/v1/auth/verify-otp`
- `GET /api/v1/listings/search?product=Maize&location=Kathwana`
- `POST /api/v1/ussd`
- `POST /api/v1/sms/inbound`
- `POST /api/v1/sms/delivery-report`
- `POST /api/v1/payments/mpesa/callback`

Protected:
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/listings` (farmer)
- `POST /api/v1/reservations` (trader)
- `POST /api/v1/farm-tours` (farmer)
- `GET /api/v1/admin/analytics` (admin)

## 8) USSD Flow (`*789#`)
### Main Menu
- `1 Sell Produce`
- `2 Buy Produce`
- `3 Farm Tours`
- `4 My Listings`
- `5 Help`

### Sell Produce Flow
- Select product
- Enter quantity
- Enter location
- Select availability (Today/Tomorrow/This week)
- Listing is stored and user sees completion text

## 9) MVP Scope Covered
Included now:
- Farmer registration
- Trader registration
- OTP phone auth
- Produce listing
- Trader search
- Reservation system
- Africa's Talking SMS integration
- Africa's Talking USSD and SMS callback compatibility
- Africa's Talking callback guard controls

Optional but scaffolded:
- Farm tours
- M-Pesa callback handling

## 10) Production Next Steps
- Confirm provider-side callback auth mode and align headers/IP list
- Integrate real M-Pesa Daraja STK push + callback signature validation
- Add OTP resend rate limits and lockout rules
- Add automated tests and API validation middleware
- Add deployment config (Render/AWS/DigitalOcean)
