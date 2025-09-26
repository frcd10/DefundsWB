# Defunds.Finance - Web3 Hedge Fund Platform

A modern DeFi platform that democratizes hedge fund access through Solana blockchain technology.

## 🚀 Quick Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/frcd10/DefundsWB)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

# Web3 Managed Funds Platform

A decentralized fund management platform built on Solana, allowing users to create investment funds, invest in existing funds, and execute transparent trades through Jupiter DEX.

## 🏗️ Architecture Overview

This is a monorepo containing:
- **Frontend**: Next.js React application (`apps/web`)
- **Backend**: TypeScript API server (`apps/backend`)
- **Solana Program**: Anchor-based smart contracts (`programs/managed-funds`)
- **Shared Types**: Common TypeScript definitions (`packages/shared`)

## 🔐 Security Model

**Key Security Features:**
- **No Master Private Key**: Each user maintains control of their own wallet
- **Fund Manager Permissions**: Only fund creators can execute trades
- **Proportional Withdrawals**: Users can only withdraw their percentage of fund assets
- **Transparent Operations**: All trades are recorded on-chain and auditable
- **Jupiter Integration**: Trades are executed through Jupiter's verified program only

## 📋 Step-by-Step Implementation Plan

### Phase 1: Core Infrastructure Setup ✅

1. **Repository Structure**
   - [x] Backend (TypeScript) in `apps/backend`
   - [x] Solana program (Anchor) in `programs/managed-funds`
   - [x] Shared types in `packages/shared`

2. **Development Environment**
   - [x] Environment variables template
   - [x] TypeScript configurations
   - [x] Build system with Turbo

### Phase 2: Solana Program Development

3. **Smart Contract Core**
   - [x] Fund account structure
   - [x] Investor position tracking
   - [x] Trade recording system
   - [ ] **TODO**: Complete instruction implementations:
     - [ ] `deposit.rs` - Handle user deposits
     - [ ] `withdraw.rs` - Handle user withdrawals
     - [ ] `execute_trade.rs` - Jupiter DEX integration
     - [ ] `update_fund.rs` - Fund management functions

4. **Security Features**
   - [ ] **TODO**: Program Derived Addresses (PDAs) for fund vaults
   - [ ] **TODO**: Access control validation
   - [ ] **TODO**: Jupiter CPI integration
   - [ ] **TODO**: Slippage protection
   - [ ] **TODO**: Emergency pause functionality

### Phase 3: Backend API Development

5. **Core Services**
   - [x] Solana connection service
   - [ ] **TODO**: Complete service implementations:
     - [ ] Fund data indexing
     - [ ] Trade execution monitoring
     - [ ] Price feed integration
     - [ ] Performance calculations

6. **API Endpoints**
   - [ ] **TODO**: Fund management endpoints
   - [ ] **TODO**: Investment endpoints
   - [ ] **TODO**: Trading endpoints
   - [ ] **TODO**: Analytics endpoints
   - [ ] **TODO**: Real-time WebSocket connections

### Phase 4: Frontend Development

7. **Core UI Components**
   - [x] Basic fund cards and modals
   - [ ] **TODO**: Wallet connection integration
   - [ ] **TODO**: Fund creation interface
   - [ ] **TODO**: Investment/withdrawal interface
   - [ ] **TODO**: Trading dashboard (manager only)

8. **Advanced Features**
   - [ ] **TODO**: Performance charts and analytics
   - [ ] **TODO**: Trade history and audit trail
   - [ ] **TODO**: Real-time updates via WebSocket
   - [ ] **TODO**: Mobile responsive design

### Phase 5: Integration & Testing

9. **Solana Integration**
   - [ ] **TODO**: Deploy to Devnet
   - [ ] **TODO**: Frontend wallet integration
   - [ ] **TODO**: Transaction signing flows
   - [ ] **TODO**: Error handling and user feedback

10. **Testing & Quality**
    - [ ] **TODO**: Unit tests for smart contracts
    - [ ] **TODO**: Integration tests
    - [ ] **TODO**: End-to-end testing
    - [ ] **TODO**: Security audit preparation

## 🚀 Getting Started

### Prerequisites

1. **Install Dependencies:**
   ```bash
   # Install Rust and Solana CLI
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs/ | sh
   sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
   
   # Install Anchor
   npm install -g @coral-xyz/anchor-cli
   
   # Install Node.js dependencies
   npm install
   ```

2. **Environment Setup:**
   ```bash
   # Copy environment template
   cp .env.example .env.local
   
   # Add your Helius API key to .env.local
   HELIUS_API_KEY=your_helius_devnet_api_key_here
   ```

3. **Generate Solana Keypair:**
   ```bash
   solana-keygen new --outfile ~/.config/solana/id.json
   solana config set --keypair ~/.config/solana/id.json
   solana config set --url devnet
   
   # Airdrop SOL for testing
   solana airdrop 2
   ```

### Development Workflow

1. **Start Development Environment:**
   ```bash
   # Build and deploy Solana program
   anchor build
   anchor deploy
   
   # Start backend API
   npm run dev --workspace=@managed-funds/backend
   
   # Start frontend
   npm run dev --workspace=apps/web
   ```

2. **Key Development Commands:**
   ```bash
   # Build all packages
   npm run build
   
   # Run tests
   npm run test
   
   # Lint code
   npm run lint
   
   # Clean build artifacts
   npm run clean
   ```

## 🔧 Technical Stack

### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **Solana Wallet Adapter**: Wallet integration
- **React Query**: Data fetching and caching

### Backend
- **Express.js**: HTTP server
- **TypeScript**: Type safety
- **WebSocket**: Real-time updates
- **Redis**: Caching and session management
- **MongoDB**: Data persistence and indexing

### Blockchain
- **Solana**: High-performance blockchain
- **Anchor**: Solana development framework
- **Jupiter**: DEX aggregator for trading
- **SPL Token**: Token standard

## 📊 Key Features

### For Fund Managers
- Create new investment funds with custom parameters
- Execute trades through Jupiter DEX integration
- Set management and performance fees
- Monitor fund performance and analytics
- Access detailed trading history

### For Investors
- Browse and discover investment funds
- Invest in funds with any amount
- Withdraw proportional share anytime
- Track portfolio performance
- View transparent trade history

### Platform Features
- Real-time price updates
- Performance analytics and charts
- Audit trail for all transactions
- Mobile-responsive interface
- Multi-wallet support

## 🔒 Security Considerations

1. **No Custody**: Platform never holds user funds
2. **Transparent Operations**: All trades recorded on-chain
3. **Access Controls**: Only fund managers can execute trades
4. **Slippage Protection**: Maximum slippage limits
5. **Emergency Controls**: Pause functionality for security

## 📈 Analytics & Reporting

The platform provides comprehensive analytics:
- **Fund Performance**: Returns, Sharpe ratio, max drawdown
- **Trade Analytics**: Success rate, average trade size, frequency
- **Risk Metrics**: Volatility, correlation analysis
- **Benchmark Comparison**: Against SOL and other indices

## 🗺️ Roadmap

### Short Term (1-2 months)
- [ ] Complete core smart contract development
- [ ] Basic frontend interface
- [ ] Devnet deployment and testing

### Medium Term (3-4 months)
- [ ] Advanced analytics dashboard
- [ ] Mobile application
- [ ] Additional DEX integrations

### Long Term (6+ months)
- [ ] Mainnet launch
- [ ] Governance token and DAO
- [ ] Advanced trading strategies
- [ ] Institutional features

## 🤝 Contributing

This is a private project currently in development. Contribution guidelines will be established once the core functionality is complete.

## 📄 License

This project is proprietary. All rights reserved.

---

## 📞 Next Steps

To continue development, you should:

1. **Add your Helius API key** to `.env.local`
2. **Complete the Solana program instructions** in `programs/managed-funds/src/instructions/`
3. **Build and deploy the program** to Devnet
4. **Implement the backend API routes** in `apps/backend/src/routes/`
5. **Connect the frontend** to the backend and Solana program

The foundation is now set up. Each component has clear TODOs to guide the implementation process.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
