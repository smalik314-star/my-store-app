# PharmaFlow - Pharmacy Billing & Inventory Management System

A premium, production-ready Pharmacy Management System built with React, Vite, and Firebase.

## Module 1: Foundation (Current)
This module establishes the core architecture, design system, and global layout of PharmaFlow.

### Features
- **Design System**: Modern UI with Tailwind CSS, custom theme, and high-quality typography (Inter & Poppins).
- **Core Layout**: Responsive dashboard with collapsible sidebar, glassmorphism header, and mobile navigation.
- **Firebase Foundation**: Initialized Firebase SDK with Auth, Firestore, and Storage configurations.
- **State Management**: Robust Authentication Context and Simulation logic for foundation testing.
- **Navigation**: Structured routing with React Router DOM and Protected Routes.
- **Components**: Reusable, commercial-grade UI components (Buttons, Inputs, Cards, Modals, etc.).

## Tech Stack
- **Frontend**: React 19, Vite, React Router DOM 7
- **Styling**: Tailwind CSS 4, Framer Motion
- **Backend**: Firebase (Authentication, Cloud Firestore, Storage)
- **Forms**: React Hook Form, Zod
- **Utilities**: date-fns, clsx, tailwind-merge, Lucide React

## Installation
1. Clone the repository.
2. Run `npm install`.
3. Create a `.env` file based on `.env.example` and add your Firebase credentials.
4. Run `npm run dev` to start the development server.

## Folder Structure
```text
src/
├── assets/          # Static assets & icons
├── components/      # UI components
│   ├── common/      # Reusable atomic components
│   └── layout/      # Sidebar, Header, etc.
├── context/         # Auth & Global state
├── firebase/        # SDK configurations
├── hooks/           # Custom React hooks
├── layouts/         # Page wrappers (MainLayout)
├── pages/           # View components
├── routes/          # Navigation logic
├── services/        # API & Firestore services
├── styles/          # Global CSS & Tailwind layers
├── utils/           # Helper functions
├── constants/       # App-wide constants
└── types/           # TypeScript interfaces
```

---
*Created by AI Studio - PharmaFlow Project Module 1*
