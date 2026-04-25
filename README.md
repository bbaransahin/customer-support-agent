# Customer Support Agent

A Next.js application for browsing a product catalog and running a support-oriented chat flow backed by retrieval and OpenAI models.

## Stack

- Next.js 15
- React 19
- TypeScript
- Vitest
- OpenAI API

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Create a local environment file:

```bash
cp .env.example .env.local
```

3. Set the required environment variables in `.env.local`.
   `NEXT_PUBLIC_CHAT_DEBUG=false` keeps retrieval details hidden from end users.

4. Start the development server:

```bash
npm run dev
```

The app should then be available at `http://localhost:3000`.

## Available Scripts

- `npm run dev` starts the Next.js development server.
- `npm run build` creates a production build.
- `npm run start` runs the production server.
- `npm run lint` runs ESLint.
- `npm run test` runs the Vitest test suite once.
- `npm run test:live` runs the opt-in live chat evaluation suite against the real OpenAI API and writes `test-results/chat-live-report.json`.
- `npm run test:watch` runs Vitest in watch mode.
- `npm run reindex` rebuilds the local embedding index from the product CSV.

## Project Notes

- Product data is sourced from `flipkart_com-ecommerce_sample.csv`.
- Generated retrieval data is stored under `.support-agent-data/` and should not be committed.
- Environment secrets should stay in local `.env*` files and should not be committed.
- Live evaluations require both `OPENAI_API_KEY` and a fresh local index from `npm run reindex`.
- `npm run dev` shows confidence scores and retrieved context automatically.
- In production, keep `NEXT_PUBLIC_CHAT_DEBUG=false` unless you explicitly want to expose chat debug details.
