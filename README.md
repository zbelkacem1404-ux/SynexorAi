# Supplier Logistics Manager

A full-stack web application for managing supplier logistics data with an interactive world map, transport routing, and comprehensive supplier database.

## Tech Stack

- **Frontend:** React 18 + TypeScript, Vite, Tailwind CSS, Leaflet.js
- **Backend:** Node.js + Express
- **Database:** SQLite (via better-sqlite3)
- **Auth:** JWT-based with admin/viewer roles

## Quick Start

```bash
# 1. Install all dependencies
npm run install:all

# 2. Seed the database with sample data
npm run seed

# 3. Start both server and client
npm run dev
```

The app will be available at:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001

## Default Users

| Username | Password   | Role   |
|----------|------------|--------|
| admin    | admin123   | admin  |
| viewer   | viewer123  | viewer |

## Features

- **Interactive World Map** — Supplier markers color-coded by Incoterm, with clustering and filter sidebar
- **Supplier Database** — Full CRUD table with search, sort, filter, pagination, CSV import/export
- **Transport Routing** — Create and visualize inbound/outbound routes on the map
- **Role-Based Access** — Admin (full CRUD) and Viewer (read-only) roles
