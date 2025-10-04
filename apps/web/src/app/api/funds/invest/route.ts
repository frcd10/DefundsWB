import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection } from '@solana/web3.js';

// Validation function
function validateInvestmentRequest(body: Record<string, any>) {
  const requiredBase = ['fundId', 'investorWallet', 'amount'] as const;
  for (const field of requiredBase) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return `Missing required field: ${field}`;
    }
  }
  const amt = Number(body.amount);
  if (!Number.isFinite(amt) || amt <= 0) return 'Amount must be a positive number';

  // signature required only when not in validateOnly precheck mode
  if (!body.validateOnly && !body.signature) {
    return 'Missing required field: signature';
  }
  // inviteCode is conditionally required; validated after we fetch fund (need accessMode)
  return null;
}

// Verify transaction on Solana
async function verifyTransaction(signature: string): Promise<boolean> {
  try {
    console.log('Verifying investment transaction:', signature);
    
    if (signature.startsWith('mock_')) {
      console.log('ERROR: Mock signatures are no longer accepted');
      return false;
    }

    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    
    const transaction = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    
    const isValid = transaction !== null;
    console.log('Investment transaction verification result:', isValid);
    
    return isValid;
  } catch (error) {
    console.error('Error verifying investment transaction:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('=== FUND INVESTMENT API CALLED ===');
    
    const body = await req.json();
    console.log('Investment request body:', body);
    
    // Validate required fields
    const validationError = validateInvestmentRequest(body);
    if (validationError) {
      console.log('Validation error:', validationError);
      return NextResponse.json({
        success: false,
        error: validationError,
      }, { status: 400 });
    }

    const { fundId, investorWallet } = body as { fundId: string; investorWallet: string };
    const amount = Number(body.amount);
    const signature: string | undefined = body.signature;
    const validateOnly: boolean = !!body.validateOnly;
    const generateInviteCodesCountRaw = body.generateInviteCodesCount;
    const referralCodeRaw: string | undefined = body.referralCode; // optional friend code
    const referralCode = referralCodeRaw ? String(referralCodeRaw).toUpperCase() : undefined;

    // Update fund in MongoDB
    console.log('Connecting to MongoDB...');
    const client = await getClientPromise();
    const db = client.db('Defunds');
    const collection = db.collection('Funds');

    // Find the fund
    console.log('Finding fund with ID:', fundId);
    const fund = await collection.findOne({ fundId });
    if (!fund) {
      console.log('Fund not found');
      return NextResponse.json({
        success: false,
        error: 'Fund not found',
      }, { status: 404 });
    }

    // Access control
    const accessMode = fund.accessMode || fund.access?.type || (fund.isPublic === false ? 'single_code' : 'public');
    let inviteOwner: string | undefined;
    if (accessMode !== 'public') {
      const providedCodeRaw: string | undefined = body.inviteCode;
      const providedCode = providedCodeRaw ? String(providedCodeRaw).toUpperCase() : undefined;
      if (!providedCode) {
        return NextResponse.json({ success: false, error: 'Invite code required' }, { status: 400 });
      }
      if (accessMode === 'single_code') {
        const storedCode = (fund.access?.code || fund.inviteCode || '').toUpperCase();
        if (!storedCode || providedCode !== storedCode) {
          return NextResponse.json({ success: false, error: 'Invalid invite code' }, { status: 400 });
        }
      } else if (accessMode === 'multi_code') {
        const codes: Array<{ code: string; used: boolean; owner?: string }> = fund.access?.codes || [];
        const codeObj = codes.find(c => c.code === providedCode);
        if (!codeObj) {
          return NextResponse.json({ success: false, error: 'Invalid invite code' }, { status: 400 });
        }
        if (codeObj.used) {
          return NextResponse.json({ success: false, error: 'Invite code already used' }, { status: 400 });
        }
        inviteOwner = codeObj.owner; // may be undefined for older data
      }
    }
    // Enforce maxPerInvestor if defined (sum of existing + new amount <= max)
    if (fund.maxPerInvestor) {
      const priorAmount = (fund.investments || [])
        .filter((inv: any) => inv.walletAddress === investorWallet)
        .reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
      if (priorAmount + amount > fund.maxPerInvestor + 1e-9) { // small epsilon
        return NextResponse.json({ success: false, error: `Per-investor cap exceeded (max ${fund.maxPerInvestor} SOL)` }, { status: 400 });
      }
    }

    // If this is only a validation precheck, return early (no tx verification or DB updates)
    if (validateOnly) {
      return NextResponse.json({ success: true, data: { valid: true } }, { status: 200 });
    }

    // Verify the transaction on Solana (after validating inputs)
    if (!signature) {
      return NextResponse.json({ success: false, error: 'Missing signature' }, { status: 400 });
    }
    console.log('Verifying investment transaction:', signature);
    const verified = await verifyTransaction(signature);
    console.log('Investment transaction verified:', verified);
    
    if (!verified) {
      console.log('Investment transaction verification failed');
      return NextResponse.json({
        success: false,
        error: 'Invalid transaction signature',
      }, { status: 400 });
    }

    // Idempotency: if we've already recorded this signature, return success
    const existingWithSig = await collection.findOne({ fundId, 'investments.transactionSignature': signature });
    if (existingWithSig) {
      console.log('Duplicate investment submission detected; returning idempotent success');
      return NextResponse.json({ success: true, data: { fundId, investorWallet, amount, signature, idempotent: true } }, { status: 200 });
    }

    console.log('Updating fund with new investment...');
    
    // Calculate shares based on current NAV (Net Asset Value)
    const currentNavPerShare = fund.currentValue && fund.totalShares > 0 
      ? fund.currentValue / fund.totalShares 
      : 1.0;
    
    const sharesToIssue = amount / currentNavPerShare;
    
    // Calculate new totals
    const newTotalDeposits = fund.totalDeposits + amount;
    const newTotalShares = fund.totalShares + sharesToIssue;
    const newCurrentValue = fund.currentValue + amount; // TVL increases by deposit amount
    
    const isExistingInvestor = fund.investments && fund.investments.some((inv: { walletAddress: string }) => 
      inv.walletAddress === investorWallet
    );
    const newInvestorCount = isExistingInvestor ? fund.investorCount : fund.investorCount + 1;

    const investmentRecord = {
      walletAddress: investorWallet,
      amount: amount,
      shares: sharesToIssue,
      navAtTime: currentNavPerShare,
      timestamp: new Date(),
      transactionSignature: signature,
      type: 'investment'
    };

    const updateDoc: any = {
      $set: {
        totalDeposits: newTotalDeposits,
        totalShares: newTotalShares,
        currentValue: newCurrentValue,
        investorCount: newInvestorCount,
        updatedAt: new Date()
      },
      $inc: { solBalance: amount },
      $push: {
        investments: investmentRecord,
        performanceHistory: {
          date: new Date().toISOString(),
          tvl: newTotalDeposits,
          nav: (newCurrentValue) / (newTotalShares),
          pnl: newCurrentValue - newTotalDeposits,
          pnlPercentage: newTotalDeposits > 0 ? ((newCurrentValue - newTotalDeposits) / newTotalDeposits) * 100 : 0
        }
      }
    };

    if ((fund.accessMode || fund.access?.type) === 'multi_code' && body.inviteCode) {
      updateDoc.$set['access.codes.$[codeEl].used'] = true;
      updateDoc.$set['access.codes.$[codeEl].usedBy'] = investorWallet;
      updateDoc.$set['access.codes.$[codeEl].usedAt'] = new Date();
    }

    const arrayFilters = ((fund.accessMode || fund.access?.type) === 'multi_code' && body.inviteCode)
      ? { arrayFilters: [{ 'codeEl.code': body.inviteCode }] }
      : undefined;

    // Generate per-investor invite codes for FUND access and stamp owner
    let newFundCodes: string[] = [];
    const perInvestorCount: number = (fund.perInvestorInviteCodes as number) || 0;
    const requestedCount = Number(generateInviteCodesCountRaw);
    const finalCount = Number.isInteger(requestedCount) ? Math.max(0, Math.min(perInvestorCount, requestedCount)) : perInvestorCount;
    if ((fund.accessMode || fund.access?.type) === 'multi_code' && finalCount > 0) {
      const set = new Set<string>();
      const existingCodes = new Set<string>((fund.access?.codes || []).map((c: any) => c.code));
      while (set.size < finalCount) {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        if (!existingCodes.has(code)) set.add(code);
      }
      newFundCodes = Array.from(set);
    }

    const updateResult = await db.collection('Funds').updateOne(
      { fundId },
      updateDoc,
      arrayFilters as any
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json({ success: false, error: 'Failed to update fund' }, { status: 500 });
    }

    if (newFundCodes.length > 0) {
      await db.collection('Funds').updateOne(
        { fundId },
        { $push: { 'access.codes': { $each: newFundCodes.map(c => ({ code: c, used: false, owner: investorWallet })) } } } as any
      );
    }

    // Users collection updates
    const usersCol = db.collection<any>('Users');
    const now = new Date();

    await usersCol.updateOne(
      { _id: investorWallet },
      { $setOnInsert: { createdAt: now, points: 0, invitedUsers: 0, invitedList: [], inviteCodes: [] }, $inc: { totalInvested: amount }, $set: { updatedAt: now } },
      { upsert: true }
    );

    // Attribute referral via explicit referralCode
    if (referralCode) {
      const refDoc = await db.collection('ReferralCodes').findOne({ code: referralCode });
      if (refDoc?.owner && refDoc.owner !== investorWallet) {
        const investorDoc = await usersCol.findOne({ _id: investorWallet }, { projection: { referredBy: 1 } });
        if (!investorDoc?.referredBy) {
          await usersCol.updateOne({ _id: investorWallet }, { $set: { referredBy: refDoc.owner, referredAt: now } });
          await usersCol.updateOne({ _id: refDoc.owner }, { $setOnInsert: { createdAt: now, points: 0, totalInvested: 0, invitedUsers: 0, invitedList: [], inviteCodes: [] }, $inc: { invitedUsers: 1 }, $addToSet: { invitedList: investorWallet }, $set: { updatedAt: now } }, { upsert: true });
          await db.collection('ReferralCodes').updateOne({ code: referralCode }, { $set: { usedBy: investorWallet, usedAt: now, status: 'used' } });
        }
      }
    }

    // Attribute referral via multi_code invite owner
    if (inviteOwner && inviteOwner !== investorWallet) {
      const investorDoc = await usersCol.findOne({ _id: investorWallet }, { projection: { referredBy: 1 } });
      if (!investorDoc?.referredBy) {
        await usersCol.updateOne({ _id: investorWallet }, { $set: { referredBy: inviteOwner, referredAt: now } });
        await usersCol.updateOne({ _id: inviteOwner }, { $setOnInsert: { createdAt: now, points: 0, totalInvested: 0, invitedUsers: 0, invitedList: [], inviteCodes: [] }, $inc: { invitedUsers: 1 }, $addToSet: { invitedList: investorWallet }, $set: { updatedAt: now } }, { upsert: true });
      }
    }

    // Generate and grant personal referral code
    async function generateUniqueCode(dbx: any): Promise<string> {
      const col = dbx.collection('ReferralCodes');
      while (true) {
        const code = Math.random().toString(36).slice(2, 10).toUpperCase();
        const exists = await col.findOne({ code });
        if (!exists) return code;
      }
    }
    const newReferralCode = await generateUniqueCode(db);
    await db.collection('ReferralCodes').insertOne({ code: newReferralCode, owner: investorWallet, status: 'active', createdAt: now, source: 'investment' });
    await usersCol.updateOne({ _id: investorWallet }, { $addToSet: { inviteCodes: newReferralCode }, $set: { updatedAt: now } });

    return NextResponse.json({ success: true, data: { fundId, investorWallet, amount, signature, newTotalDeposits, newTotalShares, newInvestorCount, inviteCodes: newFundCodes, grantedReferralCode: newReferralCode } }, { status: 201 });

  } catch (error) {
    console.error('=== ERROR PROCESSING INVESTMENT ===');
    console.error('Error details:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to process investment' }, { status: 500 });
  }
}
