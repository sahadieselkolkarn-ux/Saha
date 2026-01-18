# **App Name**: Thai Job Management

## Core Features:

- User Signup: Allows users to sign up with their name, phone, email, and password, creating a new user document in Firestore with PENDING status and empty role/department.
- User Login: Enables users to log in with their email and password.
- Pending Approval Page: A page that users are redirected to if their status is not ACTIVE, preventing access to other app menus.
- User Profile: Allows logged-in users to view and edit their profile information (displayName, phone).
- Admin User Management: ADMIN users can view a list of all users, approve them, and assign roles and departments, and change user status.
- Customer Management: OFFICE and ADMIN users can manage customer information, including tax details (useTax, taxName, taxAddress, taxId).
- Job Intake: OFFICE and ADMIN users can create new job entries by selecting a customer, filling in details, choosing a department, and attaching 1-4 photos. The initial status is RECEIVED.
- Job Listing: Displays a list of jobs, with ADMIN users seeing all jobs and MANAGER/OFFICER users seeing only jobs from their department.
- Job Details: Displays detailed job information, allows updating the status, adding notes, adding photos, and assigning the job based on user roles and department.
- Image Upload and Storage: Handles uploading 1-4 images per job (max 2MB each), storing them in Firebase Storage, and saving the download URLs in the job document.

## Style Guidelines:

- Primary color: Use a desaturated blue (#5F9EA0) for a professional and trustworthy feel. 
- Background color: Use a light, desaturated blue (#F0F8FF). It shares a hue with the primary color, while creating a clean and calm backdrop for content.
- Accent color: Use a slightly darker, brighter cyan (#00FFFF) for interactive elements. Being analogous to blue in the color wheel, cyan can contribute to an overall aesthetic harmony while drawing users' attention.
- Body font: 'PT Sans' for body text, a humanist sans-serif with a modern look and a little warmth.
- Headline font: 'Playfair' for headings, a modern serif with an elegant, high-end feel; use 'PT Sans' if longer text is anticipated.
- Use simple, clear icons to represent job statuses, departments, and user roles.
- A clean and intuitive layout with clear navigation for easy access to different sections of the app.
- Subtle transitions and animations to provide feedback on user interactions and improve the overall user experience.