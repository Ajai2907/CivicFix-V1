import express from 'express';
import fs from 'fs';
import { upload } from '../middleware/upload.js';
import { uploadImage } from '../middleware/cloudinary.js';
import { GoogleGenAI } from '@google/genai';
import {
  createComplaintDoc,
  getComplaintById,
  getAllComplaints,
  updateComplaintStatus,
  getAuthoritySummaryMetrics,
  checkDuplicateComplaint
} from '../db/firebase.js';

const router = express.Router();

// Lazy initialization of Gemini client
let geminiClient = null;
function getGemini() {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    try {
      geminiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    } catch (e) {
      console.warn('Failed to initialize GoogleGenAI client:', e.message);
      geminiClient = null;
    }
  }
  return geminiClient;
}

/**
 * Enhanced Gemini AI Analysis with Smart Department Routing & Severity
 */
async function analyzeCivicIssue(category, description, imageFilePath) {
  const fallbackDepartment = getDepartmentForCategory(category, description);
  const fallback = {
    verifiedCategory: category || 'Other',
    severity: determineFallbackSeverity(category, description),
    priority: determineFallbackPriority(category, description),
    assignedDepartment: fallbackDepartment,
    aiAssessment: 'Automated triage based on reported category and citizen description.',
    confidence: 0.88
  };

  const ai = getGemini();
  if (!ai) {
    return fallback;
  }

  try {
    const parts = [];
    if (imageFilePath && fs.existsSync(imageFilePath)) {
      const mimeType = imageFilePath.endsWith('.png') ? 'image/png' : imageFilePath.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      const imageBuffer = fs.readFileSync(imageFilePath);
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: imageBuffer.toString('base64')
        }
      });
    }

    const promptText = `
You are an expert Municipal Civic Issue Triage and Department Routing AI system.
Analyze the following citizen-reported civic issue:
Reported Category: ${category || 'Unknown'}
Description: ${description || 'No description provided'}

Evaluate the issue urgency, photographic evidence, and route it to the exact responsible civic department from the following list:
- "Water Supply Department" (for pipeline bursts, leaks, water contamination, water supply disruption)
- "Disaster Management / Municipal Engineering" (for flooding, severe waterlogging, landslide, structural collapse)
- "Roads / Municipal Engineering" (for potholes, damaged pavement, road sinkholes, road debris)
- "Sanitation Department" (for garbage overflow, dead animals, illegal dumping, street cleaning)
- "Drainage / Public Works" (for open manholes, clogged storm drains, sewage overflows, culvert blockages)
- "Electrical / Municipal Department" (for broken streetlights, hanging live wires, transformer sparks, dark corridors)
- "General Municipal Authority" (for other municipal concerns)

Return a strict JSON object with these exact keys:
{
  "verifiedCategory": "Pothole & Roads" | "Garbage & Sanitation" | "Water Leakage & Sewage" | "Streetlight & Electrical" | "Public Safety & Drainage" | "Other",
  "severity": "Critical" | "High" | "Medium" | "Low",
  "priority": "Critical" | "High" | "Medium" | "Low",
  "assignedDepartment": "Water Supply Department" | "Disaster Management / Municipal Engineering" | "Roads / Municipal Engineering" | "Sanitation Department" | "Drainage / Public Works" | "Electrical / Municipal Department" | "General Municipal Authority",
  "aiAssessment": "A concise 1-2 sentence assessment of the risk, urgency, and recommended municipal field action.",
  "confidence": 0.95
}
`;
    parts.push({ text: promptText });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI generation timeout')), 3500)
    );

    const generatePromise = ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: parts },
      config: {
        responseMimeType: 'application/json'
      }
    });

    const response = await Promise.race([generatePromise, timeoutPromise]);
    const rawText = response.text;

    if (rawText) {
      const parsed = JSON.parse(rawText);
      return {
        verifiedCategory: parsed.verifiedCategory || fallback.verifiedCategory,
        severity: ['Critical', 'High', 'Medium', 'Low'].includes(parsed.severity) ? parsed.severity : fallback.severity,
        priority: ['Critical', 'High', 'Medium', 'Low'].includes(parsed.priority) ? parsed.priority : fallback.priority,
        assignedDepartment: parsed.assignedDepartment || fallback.assignedDepartment,
        aiAssessment: parsed.aiAssessment || fallback.aiAssessment,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.94
      };
    }
  } catch (err) {
    console.warn('Gemini AI analysis error, using intelligent heuristics:', err.message);
  }

  return fallback;
}

function determineFallbackSeverity(category, description = '') {
  const text = (description + ' ' + (category || '')).toLowerCase();
  if (text.includes('burst') || text.includes('hazard') || text.includes('accident') || text.includes('sparking') || text.includes('exposed wire') || text.includes('flood') || text.includes('severe') || text.includes('collapse') || text.includes('open manhole')) {
    return 'Critical';
  }
  if (text.includes('overflow') || text.includes('broken') || text.includes('deep') || text.includes('odor') || text.includes('dark') || text.includes('leak') || text.includes('waste')) {
    return 'High';
  }
  if (text.includes('minor') || text.includes('small') || text.includes('flicker')) {
    return 'Low';
  }
  return 'Medium';
}

function determineFallbackPriority(category, description = '') {
  const sev = determineFallbackSeverity(category, description);
  if (sev === 'Critical') return 'Critical';
  if (sev === 'High') return 'High';
  if (sev === 'Medium') return 'Medium';
  return 'Low';
}

function getDepartmentForCategory(category = '', description = '') {
  const text = (category + ' ' + description).toLowerCase();
  if (text.includes('flood') || text.includes('submerged') || text.includes('disaster') || text.includes('collapse')) {
    return 'Disaster Management / Municipal Engineering';
  }
  if (text.includes('water') || text.includes('leak') || text.includes('pipeline') || text.includes('contamination')) {
    return 'Water Supply Department';
  }
  if (text.includes('pothole') || text.includes('road') || text.includes('asphalt') || text.includes('crater') || text.includes('tar')) {
    return 'Roads / Municipal Engineering';
  }
  if (text.includes('garbage') || text.includes('sanitation') || text.includes('waste') || text.includes('trash') || text.includes('dump')) {
    return 'Sanitation Department';
  }
  if (text.includes('drain') || text.includes('sewer') || text.includes('manhole') || text.includes('gutter') || text.includes('culvert')) {
    return 'Drainage / Public Works';
  }
  if (text.includes('light') || text.includes('electric') || text.includes('wire') || text.includes('lamp') || text.includes('dark')) {
    return 'Electrical / Municipal Department';
  }
  return 'General Municipal Authority';
}

// 1. Health check
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'CivicFix Firebase Backend is healthy', timestamp: new Date().toISOString() });
});

// 2. Submit a new complaint (POST /api/complaints)
router.post('/complaints', upload.single('image'), async (req, res) => {
  try {
    const { category, description, location, latitude, longitude } = req.body;

    if (!description && !category) {
      return res.status(400).json({ success: false, message: 'Please provide issue category or description.' });
    }

    const complaintId = `CMP-${Date.now().toString().slice(-6)}${Math.floor(1000 + Math.random() * 9000)}`;
    const parsedLat = latitude ? parseFloat(latitude) : 28.6139;
    const parsedLng = longitude ? parseFloat(longitude) : 77.2090;
    const locationStr = location && location.trim() ? location.trim() : 'Location pinned via GPS';

    let localFilePath = null;
    let localUrl = '';
    if (req.file) {
      localUrl = `/uploads/${req.file.filename}`;
      localFilePath = req.file.path;
    } else if (req.body.imageUrl) {
      localUrl = req.body.imageUrl;
    }

    // Upload to Cloudinary if configured; otherwise use local URL
    const finalImageUrl = await uploadImage(localFilePath, localUrl);

    // Run AI analysis for categorization, severity, priority, and department routing
    const aiResult = await analyzeCivicIssue(category, description, localFilePath);

    // Duplicate detection check
    const duplicateCheck = await checkDuplicateComplaint({
      category: category || aiResult.verifiedCategory,
      latitude: parsedLat,
      longitude: parsedLng,
      description: description
    });

    const finalCategory = category || aiResult.verifiedCategory || 'Other';
    const severity = aiResult.severity || 'Medium';
    const priority = aiResult.priority || 'Normal';
    const department = aiResult.assignedDepartment || 'Municipal Public Works';

    let authorityNotes = `AI Triage: ${aiResult.aiAssessment} Assigned to ${department}.`;
    if (duplicateCheck.isPossibleDuplicate) {
      authorityNotes += ` [Warning: Possible duplicate of ${duplicateCheck.duplicateOf} - ${duplicateCheck.reason}]`;
    }

    const complaintDocData = {
      id: complaintId,
      category: finalCategory,
      description: description || 'Civic issue reported by citizen.',
      location: locationStr,
      latitude: parsedLat,
      longitude: parsedLng,
      imageUrl: finalImageUrl,
      image_path: finalImageUrl,
      severity: severity,
      priority: priority,
      assignedDepartment: department,
      department: department,
      isPossibleDuplicate: duplicateCheck.isPossibleDuplicate,
      duplicateOf: duplicateCheck.duplicateOf,
      duplicateReason: duplicateCheck.reason,
      aiAssessment: aiResult.aiAssessment,
      aiConfidence: aiResult.confidence || 0.94,
      authorityNotes: authorityNotes
    };

    const savedDoc = await createComplaintDoc(complaintDocData);

    res.status(201).json({
      success: true,
      complaintId: complaintId,
      message: duplicateCheck.isPossibleDuplicate
        ? `Complaint registered. Notice: Possible duplicate detected (Related: ${duplicateCheck.duplicateOf})`
        : 'Complaint registered successfully in Firebase',
      data: savedDoc,
      aiAnalysis: aiResult,
      duplicateWarning: duplicateCheck.isPossibleDuplicate ? duplicateCheck : null
    });
  } catch (err) {
    console.error('Error creating complaint in Firebase:', err);
    res.status(500).json({ success: false, message: 'Error saving complaint to Firestore: ' + err.message });
  }
});

// 3. Get all complaints with filtering (GET /api/complaints)
router.get('/complaints', async (req, res) => {
  try {
    const { status, category, department, priority, severity, search } = req.query;

    const complaints = await getAllComplaints({
      status,
      category,
      department,
      priority,
      severity,
      search
    });

    res.json({
      success: true,
      count: complaints.length,
      complaints: complaints
    });
  } catch (err) {
    console.error('Error fetching complaints from Firestore:', err);
    res.status(500).json({ success: false, message: 'Error retrieving complaints: ' + err.message });
  }
});

// 4. Track complaint by ID (GET /api/complaints/track?complaintId=... or GET /api/complaints/:id)
router.get('/complaints/track', async (req, res) => {
  try {
    const complaintId = (req.query.complaintId || req.query.id || '').trim();

    if (!complaintId) {
      return res.status(400).json({ success: false, message: 'Complaint ID is required.' });
    }

    const complaint = await getComplaintById(complaintId);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `No complaint found with ID "${complaintId}". Please verify your ticket reference.`
      });
    }

    res.json({
      success: true,
      complaint: complaint
    });
  } catch (err) {
    console.error('Error tracking complaint in Firestore:', err);
    res.status(500).json({ success: false, message: 'Error tracking complaint: ' + err.message });
  }
});

router.get('/complaints/:id', async (req, res) => {
  try {
    const complaintId = req.params.id.trim();
    const complaint = await getComplaintById(complaintId);

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }

    res.json({ success: true, complaint: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Update complaint status and lifecycle (PATCH / PUT / POST /api/authority/complaints/:id/status)
const updateStatusHandler = async (req, res) => {
  try {
    const complaintId = req.params.id.trim();
    const { status, authority_notes, department, priority, updatedBy } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required (Submitted, Under Review, Assigned, In Progress, Resolved).'
      });
    }

    const updated = await updateComplaintStatus(complaintId, {
      status,
      authority_notes,
      department,
      priority,
      updatedBy: updatedBy || 'Chief Municipal Officer'
    });

    res.json({
      success: true,
      message: `Complaint ${complaintId} status updated to "${status}"`,
      complaint: updated
    });
  } catch (err) {
    console.error('Error updating complaint status in Firestore:', err);
    res.status(500).json({ success: false, message: 'Error updating complaint: ' + err.message });
  }
};

router.patch('/authority/complaints/:id/status', updateStatusHandler);
router.put('/authority/complaints/:id/status', updateStatusHandler);
router.post('/authority/complaints/:id/status', updateStatusHandler);

// 6. Authority summary metrics and analytics (GET /api/authority/summary)
router.get('/authority/summary', async (req, res) => {
  try {
    const summaryData = await getAuthoritySummaryMetrics();
    res.json({
      success: true,
      data: summaryData
    });
  } catch (err) {
    console.error('Error generating summary from Firestore:', err);
    res.status(500).json({ success: false, message: 'Error generating summary: ' + err.message });
  }
});

export default router;
