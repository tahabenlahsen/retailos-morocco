# RetailOS Morocco - Architecture Design

## System Overview

RetailOS Morocco is a multi-tenant SaaS platform for retail business management, designed specifically for the Moroccan market with support for French, Arabic, and English languages.

## Technology Stack

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod
- **State Management**: React Context + Server Actions
- **PWA**: next-pwa

### Backend
- **Framework**: Next.js API Routes + Server Actions
- **Language**: TypeScript
- **Validation**: Zod
- **Authentication**: NextAuth.js v5 (Auth.js)
- **API**: RESTful API routes + Server Actions

### Database
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Migrations**: Prisma Migrate
- **Seeding**: Prisma Seed

### Infrastructure
- **Containerization**: Docker
- **Environment**: Node.js 18+
- **Deployment**: Vercel/Docker-ready

## Architecture Principles

1. **Multi-tenancy**: Complete data isolation between businesses
2. **Security**: Defense-in-depth, RBAC, audit logging
3. **Scalability**: Horizontal scaling, database optimization
4. **Maintainability**: Clean architecture, separation of concerns
5. **Performance**: Optimistic UI, caching, lazy loading
6. **Reliability**: Database transactions, error handling

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Desktop    │  │    Tablet    │  │    Mobile    │      │
│  │   (Next.js)  │  │   (Next.js)  │  │   (Next.js)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Next.js App Router + API Routes         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │  │
│  │  │ Server       │  │ API          │  │ Middleware │ │  │
│  │  │ Actions      │  │ Routes       │  │            │ │  │
│  │  └──────────────┘  └──────────────┘  └────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Business Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Auth        │  │  Inventory   │  │  Sales       │      │
│  │  Service     │  │  Service     │  │  Service     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Analytics   │  │  AI          │  │  Reporting   │      │
│  │  Service     │  │  Service     │  │  Service     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Data Layer                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    Prisma ORM                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                              │                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  PostgreSQL Database                  │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐            │  │
│  │  │ Business │  │  Store   │  │ Product  │            │  │
│  │  │   Data   │  │  Data    │  │   Data   │            │  │
│  │  └──────────┘  └──────────┘  └──────────┘            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Multi-Tenancy Strategy

### Tenant Isolation
- **Row-Level Security**: Every data row includes `businessId` and `storeId`
- **Query Scoping**: All queries automatically filter by tenant context
- **Validation**: Server-side validation ensures tenant boundaries
- **Security**: Middleware enforces tenant isolation on all API routes

### Tenant Context
```typescript
interface TenantContext {
  businessId: string;
  storeId: string;
  userId: string;
  userRole: UserRole;
}
```

## Security Architecture

### Authentication Flow
1. User registers with email/password
2. Email verification (optional)
3. Login creates secure session
4. Session contains tenant context
5. Every request validates session

### Authorization
- **Role-Based Access Control (RBAC)**
- **Permission-based feature access**
- **Store-level data access**
- **Audit logging for sensitive actions**

### Security Measures
- Password hashing (bcrypt)
- Rate limiting
- SQL injection prevention (Prisma)
- XSS protection (React)
- CSRF protection (Next.js)
- Secure HTTP-only cookies
- Environment variable protection
- Input validation (Zod)

## Database Schema Overview

### Core Entities
- **User**: Authentication and profile
- **Business**: Tenant organization
- **Store**: Physical location
- **Role**: User roles
- **Permission**: Granular permissions

### Business Entities
- **Product**: Inventory items
- **Category**: Product categorization
- **Brand**: Product brands
- **Supplier**: Product suppliers
- **Customer**: Customer management

### Transaction Entities
- **Sale**: Sales transactions
- **SaleItem**: Sale line items
- **Payment**: Payment records
- **Refund**: Refund transactions
- **CashRegister**: Cash register sessions
- **CashRegisterTransaction**: Register movements

### Inventory Entities
- **InventoryMovement**: Stock changes
- **PurchaseOrder**: Supplier orders
- **PurchaseOrderItem**: Order line items
- **StockAdjustment**: Manual adjustments

### Financial Entities
- **Expense**: Business expenses
- **ExpenseCategory**: Expense categories

### System Entities
- **Notification**: User notifications
- **AuditLog**: Action audit trail
- **Session**: User sessions

## API Architecture

### API Routes Structure
```
/api/auth/*         - Authentication
/api/business/*     - Business management
/api/stores/*       - Store management
/api/products/*     - Product CRUD
/api/inventory/*    - Inventory operations
/api/sales/*        - Sales transactions
/api/pos/*          - POS operations
/api/payments/*     - Payment processing
/api/purchases/*    - Purchase orders
/api/suppliers/*    - Supplier management
/api/customers/*    - Customer management
/api/expenses/*     - Expense tracking
/api/analytics/*    - Business analytics
/api/ai/*           - AI assistant
/api/notifications/* - Notifications
/api/users/*        - User management
/api/roles/*        - Role management
```

### Server Actions Structure
```
@/actions/auth.*         - Authentication actions
@/actions/business.*     - Business operations
@/actions/products.*     - Product operations
@/actions/sales.*        - Sales operations
@/actions/inventory.*    - Inventory operations
@/actions/analytics.*    - Analytics operations
```

## Localization Architecture

### Supported Languages
- French (fr) - Default
- Arabic (ar) - RTL support
- English (en)

### Implementation
- **i18next** for translation management
- **Language detection** from browser/settings
- **RTL support** for Arabic
- **Currency formatting** (MAD/DH)
- **Date/number formatting** by locale
- **Language switcher** without state loss

## Performance Optimization

### Database
- Indexed foreign keys
- Query optimization
- Connection pooling
- Read replicas (future)

### Application
- Server-side rendering (SSR)
- Static generation where possible
- Image optimization
- Code splitting
- Lazy loading
- Caching strategy

### Frontend
- Optimistic UI updates
- Skeleton loaders
- Infinite scrolling (pagination)
- Debounced search
- Virtual lists for large datasets

## Monitoring & Logging

### Application Logging
- Structured logging
- Error tracking
- Performance monitoring
- Audit logging

### Metrics
- API response times
- Database query times
- Error rates
- User engagement metrics

## Deployment Architecture

### Development
- Local PostgreSQL
- Next.js dev server
- Hot reloading

### Production
- Containerized deployment
- PostgreSQL (managed)
- CDN for static assets
- SSL/TLS encryption
- Automated backups
- Database migrations

## Development Workflow

### Phase 1: Foundation
- Project setup
- Database schema
- Authentication
- Multi-tenancy

### Phase 2: Core Features
- Products & inventory
- POS & sales
- Payments
- Cash register

### Phase 3: Business Operations
- Purchases & suppliers
- Customers
- Expenses
- Analytics

### Phase 4: Advanced Features
- AI assistant
- Notifications
- Multi-store
- PWA

### Phase 5: Quality & Production
- Testing
- Security audit
- Performance optimization
- Documentation
- Deployment

## Testing Strategy

### Unit Tests
- Business logic
- Utilities
- Services

### Integration Tests
- API routes
- Database operations
- Authentication flows

### E2E Tests
- Critical user journeys
- Multi-tenancy isolation
- Payment flows

### Security Tests
- Tenant isolation
- Permission checks
- SQL injection prevention
- XSS prevention

## Future Scalability

### Horizontal Scaling
- Stateless application design
- Database connection pooling
- Session storage (Redis)
- CDN for static assets

### Feature Additions
- Mobile apps (React Native)
- Advanced AI features
- Payment gateway integrations
- Accounting software integration
- E-commerce integration
