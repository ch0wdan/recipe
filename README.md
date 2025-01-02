
# Cast Iron Recipe and Cooking App

A full-stack web application for managing and discovering cast iron cooking recipes with automated recipe crawling capabilities.

## 🚀 Features

### User Features
- Browse and search recipes specifically for cast iron cookware
- Filter recipes by cookware type (skillet, Dutch oven, griddle)
- View detailed recipe information including:
  - Preparation time
  - Cooking time
  - Difficulty level
  - Serving size
  - Ingredients
  - Step-by-step instructions
- Rate recipes (1-5 stars)
- Comment on recipes
- User authentication system
- Mobile-responsive design

### Admin Features
- Recipe crawler system for aggregating recipes from other websites
- Admin dashboard for:
  - Managing crawler configurations
  - Role-based access control
  - User management
  - Recipe moderation
- Interactive crawler analyzer for configuring selectors

## 🛠 Tech Stack

### Frontend
- React 18 with TypeScript
- TailwindCSS for styling
- shadcn/ui components
- React Query for data fetching
- Wouter for routing
- Zod for validation

### Backend
- Express.js server
- PostgreSQL database
- Drizzle ORM
- Node-cron for scheduled crawling
- JSDOM for web scraping
- Passport.js for authentication

## 📦 Installation

1. Clone the repository in Replit
2. Install dependencies:
```bash
npm install
```

3. Set up database schema:
```bash
npm run db:push
```

4. Start the development server:
```bash
npm run dev
```

## 🗄️ Project Structure

```
├── client/                # Frontend React application
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── pages/        # Page components
│   │   └── lib/          # Utility functions
├── server/               # Backend Express application
│   ├── middleware/       # Express middlewares
│   ├── auth.ts          # Authentication logic
│   ├── crawler.ts       # Recipe crawler implementation
│   └── routes.ts        # API routes
└── db/                  # Database configuration and schema
```

## 🔑 Environment Variables

Required environment variables in Replit Secrets:
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for session management
- `ADMIN_EMAIL`: Default admin user email
- `ADMIN_PASSWORD`: Default admin user password

## 📚 API Endpoints

### Authentication
- `POST /api/auth/login`: User login
- `POST /api/auth/register`: User registration
- `POST /api/auth/logout`: User logout

### Recipes
- `GET /api/recipes`: List recipes
- `GET /api/recipes/:id`: Get recipe details
- `POST /api/recipes`: Create recipe (Admin only)
- `PUT /api/recipes/:id`: Update recipe (Admin only)
- `DELETE /api/recipes/:id`: Delete recipe (Admin only)

### Admin
- `GET /api/admin/crawler`: Get crawler configurations
- `POST /api/admin/crawler`: Update crawler settings
- `POST /api/admin/crawler/run`: Manually trigger crawler
- `GET /api/admin/roles`: List roles
- `POST /api/admin/roles`: Create/update roles

## 🔒 Security

- Role-based access control (RBAC) for admin features
- Session-based authentication
- Input validation using Zod
- SQL injection protection via Drizzle ORM
- XSS protection through React's built-in escaping
- CSRF protection via same-origin policy

## 🚗 Development Workflow

1. Make changes in your fork
2. Test changes locally using `npm run dev`
3. Commit changes using the Projects tool
4. Merge changes into the main branch

## 📝 License

MIT License - see LICENSE file for details
