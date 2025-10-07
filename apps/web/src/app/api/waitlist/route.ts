/* POST /api/waitlist  – save email + role (trader | investor) */
import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { WaitlistRequest, WaitlistResponse } from '@/types/database';
import { getRateLimitInfo } from '@/lib/rateLimit';

export async function POST(req: NextRequest): Promise<NextResponse<WaitlistResponse>> {
  try {
    // Check rate limit first
    const rateLimitResult = getRateLimitInfo(req);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { 
          success: false, 
          error: rateLimitResult.message || 'Rate limit exceeded' 
        },
        { status: 429 } // Too Many Requests
      );
    }

    const { email, role }: WaitlistRequest = await req.json();

    // Validate input
    if (!email || !role) {
      return NextResponse.json(
        { success: false, error: 'Email and role are required' },
        { status: 400 }
      );
    }

    if (!['trader', 'investor'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Role must be either "trader" or "investor"' },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Connect to MongoDB
    const client = await getClientPromise();
    const db = client.db('Defunds');
    
    // Choose collection based on role
    const collection = role === 'trader' ? db.collection('Traders') : db.collection('Investors');

    // Check if email already exists
    const existingUser = await collection.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'Email already registered' },
        { status: 409 }
      );
    }

    // Create user document with string _id (no ObjectId)
    const emailId = email.toLowerCase().trim();
    const userDoc = {
      _id: emailId,
      email: emailId,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    // Insert into the appropriate collection
    const result = await collection.insertOne(userDoc);

    console.log(`[waitlist] Saved ${role}:`, email, 'with ID:', result.insertedId);

    return NextResponse.json({ 
      success: true, 
      message: `Successfully added to ${role} waitlist`,
      id: result.insertedId.toString()
    });

  } catch (error) {
    console.error('[waitlist] Error:', error);
    
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
