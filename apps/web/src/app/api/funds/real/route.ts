import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    // Get funds from MongoDB
    const client = await getClientPromise();
    const db = client.db('Defunds');
    const collection = db.collection('Funds');

    const funds = await collection
      .find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalCount = await collection.countDocuments();

    return NextResponse.json({
      success: true,
      data: {
        funds,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });

  } catch (error) {
    console.error('Error fetching real funds:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch funds',
    }, { status: 500 });
  }
}
