import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate as auth, requireActive as active } from '../auth.js';

const router = Router();

// Helper to catch async errors and pass them to Express error handler
const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

// Helper to clean string input
const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * GET /api/profile
 * Returns the logged-in user's account details combined with role-specific profile (student or alumni)
 */
router.get('/', auth, asyncRoute(async (req, res) => {
  // 1. Fetch basic user record
  const userResult = await pool.query(
    'SELECT id,name,email,role,status,created_at FROM users WHERE id=$1',
    [req.user.id]
  );
  const user = userResult.rows[0];

  // 2. Fetch role-specific profile
  let extraProfile = {};
  if (req.user.role === 'alumni') {
    const alumniResult = await pool.query('SELECT * FROM alumni_profiles WHERE user_id=$1', [req.user.id]);
    extraProfile = alumniResult.rows[0] || {};
  } else if (req.user.role === 'student') {
    const studentResult = await pool.query('SELECT * FROM student_profiles WHERE user_id=$1', [req.user.id]);
    extraProfile = studentResult.rows[0] || {};
  }

  // 3. Return combined profile object
  res.json({
    ...extraProfile,
    ...user,
    profile_id: extraProfile.id ?? null,
    id: user.id
  });
}));

/**
 * PUT /api/profile
 * Updates the user's name and role-specific profile information
 */
router.put('/', auth, active, asyncRoute(async (req, res) => {
  // Update name in users table if provided
  if (req.body.name !== undefined) {
    const trimmedName = cleanText(req.body.name);
    if (trimmedName) {
      await pool.query('UPDATE users SET name = $1 WHERE id = $2', [trimmedName, req.user.id]);
    }
  }

  // Update alumni profile
  if (req.user.role === 'alumni') {
    const existing = (await pool.query('SELECT * FROM alumni_profiles WHERE user_id = $1', [req.user.id])).rows[0];
    if (existing) {
      const graduationYear = req.body.graduation_year !== undefined ? (Number(req.body.graduation_year) || 2024) : existing.graduation_year;
      const department = req.body.department !== undefined ? cleanText(req.body.department) : existing.department;
      const degree = req.body.degree !== undefined ? cleanText(req.body.degree) : existing.degree;
      const company = req.body.company !== undefined ? cleanText(req.body.company) : existing.company;
      const jobTitle = req.body.job_title !== undefined ? cleanText(req.body.job_title) : existing.job_title;
      const location = req.body.location !== undefined ? cleanText(req.body.location) : existing.location;
      const bio = req.body.bio !== undefined ? cleanText(req.body.bio) : existing.bio;
      const skills = req.body.skills !== undefined ? (Array.isArray(req.body.skills) ? req.body.skills : []) : existing.skills;
      const linkedinUrl = req.body.linkedin_url !== undefined ? cleanText(req.body.linkedin_url) : existing.linkedin_url;
      const isPublic = req.body.is_public !== undefined ? Boolean(req.body.is_public) : existing.is_public;

      await pool.query(
        `UPDATE alumni_profiles 
         SET graduation_year = $1, department = $2, degree = $3, company = $4, job_title = $5, location = $6, bio = $7, skills = $8, linkedin_url = $9, is_public = $10, updated_at = NOW() 
         WHERE user_id = $11`,
        [graduationYear, department, degree, company, jobTitle, location, bio, skills, linkedinUrl, isPublic, req.user.id]
      );
    }
  }

  // Update student profile
  if (req.user.role === 'student') {
    const existing = (await pool.query('SELECT * FROM student_profiles WHERE user_id = $1', [req.user.id])).rows[0];
    if (existing) {
      const studentId = req.body.student_id !== undefined ? cleanText(req.body.student_id) : existing.student_id;
      const department = req.body.department !== undefined ? cleanText(req.body.department) : existing.department;
      const degree = req.body.degree !== undefined ? cleanText(req.body.degree) : existing.degree;
      const currentYear = req.body.current_year !== undefined ? cleanText(req.body.current_year) : existing.current_year;
      const graduationYear = req.body.graduation_year !== undefined ? (req.body.graduation_year ? Number(req.body.graduation_year) : null) : existing.graduation_year;
      const skills = req.body.skills !== undefined ? (Array.isArray(req.body.skills) ? req.body.skills : []) : existing.skills;
      const interests = req.body.interests !== undefined ? (Array.isArray(req.body.interests) ? req.body.interests : []) : existing.interests;
      const careerInterests = req.body.career_interests !== undefined ? (Array.isArray(req.body.career_interests) ? req.body.career_interests : []) : existing.career_interests;
      const bio = req.body.bio !== undefined ? cleanText(req.body.bio) : existing.bio;

      await pool.query(
        `UPDATE student_profiles 
         SET student_id = $1, department = $2, degree = $3, current_year = $4, graduation_year = $5, skills = $6, interests = $7, career_interests = $8, bio = $9 
         WHERE user_id = $10`,
        [studentId, department, degree, currentYear, graduationYear, skills, interests, careerInterests, bio, req.user.id]
      );
    }
  }

  res.json({ message: 'Profile updated successfully.' });
}));

export default router;
