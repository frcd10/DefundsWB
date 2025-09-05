import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export async function POST(req: NextRequest) {
  try {
    console.log('=== WITHDRAW FROM FUND API CALLED ===');
    
    const body = await req.json();
    console.log('Request body:', body);
    
    const { fundId, walletAddress, sharePercentage, signature } = body;

    // Validate required fields
    if (!fundId || !walletAddress || !sharePercentage || !signature) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: fundId, walletAddress, sharePercentage, signature',
      }, { status: 400 });
    }

    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    const client = await getClientPromise();
    const db = client.db('Defunds');
    const collection = db.collection('Funds');

    // Find the fund
    const fund = await collection.findOne({ fundId });
    if (!fund) {
      return NextResponse.json({
        success: false,
        error: 'Fund not found',
      }, { status: 404 });
    }

    // TODO: Verify the withdrawal transaction on Solana
    // TODO: Update fund data based on withdrawal
    // TODO: Record withdrawal transaction

    console.log('Withdrawal processed successfully');

    return NextResponse.json({
      success: true,
      data: {
        fundId,
        walletAddress,
        sharePercentage,
        signature,
        withdrawnAmount: 'calculated_amount', // TODO: Calculate based on vault balance
      },
    }, { status: 200 });

  } catch (error) {
    console.error('=== ERROR PROCESSING WITHDRAWAL ===');
    console.error('Error details:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process withdrawal',
    }, { status: 500 });
  }
}
