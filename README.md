# FieldPro Jobs - HomeService CRM Platform

A complete home service management platform built with Next.js, TypeScript, and Tailwind CSS.

## Features

### Job Management Workflow
- **Estimate** → **Schedule** → **On Site** → **Done** → **Invoice** → **Paid**
- Interactive workflow pipeline with drag-and-drop status updates
- Job cards with customer details, amounts, and progress tracking

### Customer Portal
- Customer database management
- Contact information and service history
- Customer search and filtering

### Scheduling
- Calendar-based appointment management
- Weekly and daily schedule views
- Technician assignment and time slot management

### Invoicing
- Automated invoice generation
- Payment tracking and status management
- Revenue analytics and reporting

### Dashboard
- Real-time statistics and KPIs
- Recent jobs overview
- Workflow status summary

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Build Tool**: Next.js built-in bundler

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
├── app/                    # Next.js App Router pages
│   ├── customers/         # Customer management page
│   ├── invoices/          # Invoice management page
│   ├── jobs/             # Job management page
│   ├── schedule/         # Scheduling page
│   ├── layout.tsx        # Root layout with dashboard
│   └── page.tsx          # Dashboard home page
├── components/            # Reusable React components
│   ├── DashboardLayout.tsx
│   ├── JobCard.tsx
│   ├── JobWorkflow.tsx
├── public/               # Static assets
└── package.json          # Dependencies and scripts
```

## Deployment

### Vercel (Recommended)
1. Push your code to GitHub
2. Connect your repository to Vercel
3. Deploy automatically on every push

### Other Platforms
The app can be deployed to any platform that supports Node.js:
- Netlify
- Railway
- Render
- AWS Amplify

## Usage

1. **Dashboard**: View overall statistics and recent jobs
2. **Jobs**: Manage job workflows and update statuses
3. **Customers**: Maintain customer database
4. **Schedule**: Plan and track appointments
5. **Invoices**: Handle billing and payments

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.