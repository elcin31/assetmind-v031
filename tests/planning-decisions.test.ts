import { describe, expect, it } from 'vitest';
import type { PortfolioSnapshot,Transaction } from '../src/types';
import { enrichPositionsWithQuotes } from '../src/math/pnl';
import { calculatePortfolioAnalytics } from '../src/math/analytics';
import { datedReturns } from '../src/math/performance';
import { buildConstrainedProposal,DEFAULT_CONSTRAINTS,simulateDecision,decisionState,parseTargetDraft,targetRows,planningMinimumVariance } from '../src/math/planningDecisions';

function fixture(horizon:'20D'|'60D'='60D') {
  const transactions:Transaction[]=['AAPL','MSFT'].map((symbol,i)=>({id:symbol,portfolio_id:'p',symbol,type:'BUY',quantity:i===0?40:20,price:100,currency:'USD',timestamp:'2025-01-01T10:00:00Z',created_at:'2025-01-01T10:00:00Z'}));
  const quotes=new Map(transactions.map(t=>[t.symbol,{symbol:t.symbol,price:100,change:0,changePercent:0,timestamp:1}]));
  const s:PortfolioSnapshot={portfolio:{id:'p',name:'Test',base_currency:'USD',created_at:'2025-01-01'},transactions,...enrichPositionsWithQuotes(transactions,quotes),targetAllocation:[{symbol:'AAPL',weight:.4},{symbol:'MSFT',weight:.4}],cashLedger:{complete:true,balance:4000,minimumBalance:0,reason:null,deposits:10000,withdrawals:0,dividends:0,fees:0},accountValue:10000};
  const histories=new Map(['AAPL','MSFT','SPY'].map((symbol,j)=>[symbol,Array.from({length:100},(_,i)=>({date:new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),close:100+i*.1+Math.sin(i*.4+j)*3}))]));
  const a=calculatePortfolioAnalytics(s,histories,'SPY','ALL',horizon,'2025-04-10',0,0);
  const b=datedReturns(histories.get('SPY')!);
  return {s,a,b};
}
const buy={symbol:'MSFT',type:'BUY' as const,mode:'quantity' as const,amount:10,price:100};

describe('hypothetical trade decisions',()=>{
  it('BUY updates cash, account weights and risk without touching transactions or P&L',()=>{
    const {s,a,b}=fixture();const original=JSON.stringify(s);
    const r=simulateDecision(s,DEFAULT_CONSTRAINTS,buy,a,b);
    expect(r.valid).toBe(true);expect(r.before!.cash.value).toBe(4000);expect(r.after!.cash.value).toBe(3000);
    expect(r.before!.positionWeight.value).toBe(.2);expect(r.after!.positionWeight.value).toBe(.3);
    expect(r.after!.volatility.value).not.toBeNull();expect(r.after!.beta.value).not.toBeNull();expect(r.after!.var95.value).not.toBeNull();
    expect(r.summary.join(' ')).toContain('Вес MSFT увеличивается');expect(JSON.stringify(s)).toBe(original);
  });
  it('SELL changes quantity and releases cash; full closure has zero known weight',()=>{
    const {s,a,b}=fixture();const r=simulateDecision(s,DEFAULT_CONSTRAINTS,{...buy,symbol:'AAPL',type:'SELL',amount:40},a,b);
    expect(r.valid).toBe(true);expect(r.after!.cash.value).toBe(8000);expect(r.after!.positionWeight.value).toBe(0);expect(r.after!.riskContribution.value).toBe(0);
  });
  it('marks remaining inventory at observed prices even when execution is different',()=>{
    const {s,a,b}=fixture();const r=simulateDecision(s,DEFAULT_CONSTRAINTS,{...buy,symbol:'AAPL',type:'SELL',amount:10,price:90},a,b);
    expect(r.after!.cash.value).toBe(4900);expect(r.after!.positionWeight.value).toBeCloseTo(3000/9900);
  });
  it('supports trade value input',()=>{
    const {s,a,b}=fixture();const r=simulateDecision(s,DEFAULT_CONSTRAINTS,{...buy,mode:'value',amount:1000},a,b);
    expect(r.after!.cash.value).toBe(3000);expect(r.after!.positionWeight.value).toBe(.3);
  });
  it('rejects insufficient cash, overselling, forbidden sales, min trade and max position',()=>{
    const {s,a,b}=fixture();
    expect(simulateDecision(s,DEFAULT_CONSTRAINTS,{...buy,amount:41},a,b).reason).toContain('недостаточно');
    expect(simulateDecision(s,DEFAULT_CONSTRAINTS,{...buy,type:'SELL',amount:21},a,b).valid).toBe(false);
    expect(simulateDecision(s,{...DEFAULT_CONSTRAINTS,noSell:true},{...buy,type:'SELL'},a,b).valid).toBe(false);
    expect(simulateDecision(s,{...DEFAULT_CONSTRAINTS,minimumTradeValue:1001},buy,a,b).valid).toBe(false);
    expect(simulateDecision(s,{...DEFAULT_CONSTRAINTS,maxPositionWeight:.25},buy,a,b).reason).toContain('max position');
    expect(simulateDecision(s,{...DEFAULT_CONSTRAINTS,minimumCashWeight:.35},buy,a,b).reason).toContain('minimum cash');
  });
  it('keeps missing risk inputs null, not zero; still explains weight and cash',()=>{
    const {s,a,b}=fixture();a.matrix=null;
    const r=simulateDecision(s,DEFAULT_CONSTRAINTS,buy,a,b);
    expect(r.valid).toBe(true);
    for(const key of ['volatility','beta','var95','diversification','riskContribution'] as const){expect(r.after![key].value).toBeNull();expect(r.after![key].reason).toBeTruthy();}
  });
  it('20D VaR remains unavailable and missing benchmark does not fabricate beta',()=>{
    const {s,a}=fixture('20D');const r=simulateDecision(s,DEFAULT_CONSTRAINTS,buy,a,[]);
    expect(r.after!.var95.value).toBeNull();expect(r.after!.var95.reason).toContain('60');expect(r.after!.beta.value).toBeNull();expect(r.after!.volatility.value).not.toBeNull();
  });
  it('does not treat execution price as market data for an unknown ticker',()=>{
    const {s,a,b}=fixture();expect(simulateDecision(s,DEFAULT_CONSTRAINTS,{...buy,symbol:'NEW'},a,b).reason).toContain('рыночной котировки');
    s.valuation.complete=false;expect(simulateDecision(s,DEFAULT_CONSTRAINTS,buy,a,b).valid).toBe(false);
  });
  it('refuses misaligned matrix return rows and all-cash risk',()=>{
    const {s,a,b}=fixture();a.matrix!.returns[1][0].startDate='2000-01-01';
    expect(decisionState(s.positions,4000,s.targetAllocation!,'AAPL',a,b).volatility.value).toBeNull();
    expect(decisionState([],10000,s.targetAllocation!,'AAPL',a,b).volatility.value).toBeNull();
  });
});

describe('constrained proposals and new capital',()=>{
  it('reuses target drift and enforces buy-only without funding from sales',()=>{
    const {s}=fixture();s.targetAllocation=[{symbol:'AAPL',weight:.2},{symbol:'MSFT',weight:.6}];
    const p=buildConstrainedProposal(s,{...DEFAULT_CONSTRAINTS,buyOnly:true});
    expect(p.available).toBe(true);expect(p.rows.every(r=>r.action==='BUY')).toBe(true);expect(p.rows[0].delta).toBeCloseTo(2000);expect(p.cashAfter).toBeCloseTo(2000);
    const sells=buildConstrainedProposal(s,DEFAULT_CONSTRAINTS);expect(sells.rows.some(r=>r.action==='SELL')).toBe(true);expect(sells.afterDrift).toBeCloseTo(0);
  });
  it('caps proposed positions and retains minimum cash',()=>{
    const {s}=fixture();s.targetAllocation=[{symbol:'AAPL',weight:.1},{symbol:'MSFT',weight:.8}];
    const p=buildConstrainedProposal(s,{...DEFAULT_CONSTRAINTS,maxPositionWeight:.45,minimumCashWeight:.3});
    expect(p.rows.every(r=>r.afterWeight<=.45+1e-8)).toBe(true);expect(p.cashAfter!).toBeGreaterThanOrEqual(3000);
  });
  it('raises minimum cash even when saved targets would invest it',()=>{
    const {s}=fixture();const p=buildConstrainedProposal(s,{...DEFAULT_CONSTRAINTS,minimumCashWeight:.7});
    expect(p.cashAfter!).toBeGreaterThanOrEqual(7000-1e-8);expect(p.rows.some(r=>r.action==='SELL')).toBe(true);
  });
  it('uses only new capital, never sells and improves post-deposit drift',()=>{
    const {s}=fixture();const original=JSON.stringify(s);const p=buildConstrainedProposal(s,DEFAULT_CONSTRAINTS,1000);
    expect(p.available).toBe(true);expect(p.rows.every(r=>r.action==='BUY')).toBe(true);expect(p.rows.reduce((v,r)=>v+r.delta,0)).toBeCloseTo(1000);expect(p.cashAfter).toBeCloseTo(4000);expect(p.afterDrift!).toBeLessThan(p.drift!);expect(JSON.stringify(s)).toBe(original);
  });
  it('respects minimum trade, preserves unallocated cash and skips unknown quotes',()=>{
    const {s}=fixture();s.targetAllocation=[{symbol:'AAPL',weight:.5},{symbol:'UNKNOWN',weight:.4}];
    const p=buildConstrainedProposal(s,{...DEFAULT_CONSTRAINTS,minimumTradeValue:600},1000);
    expect(p.rows.every(r=>r.delta>=600 && r.symbol!=='UNKNOWN')).toBe(true);expect(p.notes.join(' ')).toContain('UNKNOWN');
    const blocked=buildConstrainedProposal(s,{...DEFAULT_CONSTRAINTS,minimumTradeValue:1001},1000);
    expect(blocked.rows).toEqual([]);expect(blocked.unallocated).toBe(1000);
  });
  it('rejects unknown cash, incomplete quotes, NaN and nonpositive capital',()=>{
    const {s}=fixture();expect(buildConstrainedProposal(s,DEFAULT_CONSTRAINTS,0).available).toBe(false);
    expect(buildConstrainedProposal(s,{...DEFAULT_CONSTRAINTS,minimumTradeValue:NaN}).available).toBe(false);
    s.cashLedger!.complete=false;expect(buildConstrainedProposal(s,DEFAULT_CONSTRAINTS).available).toBe(false);
    s.cashLedger!.complete=true;s.positions[0].marketValue=NaN;expect(buildConstrainedProposal(s,DEFAULT_CONSTRAINTS).available).toBe(false);
  });
  it('validates drafts without dropping negative weights; includes target CASH',()=>{
    expect(parseTargetDraft({AAPL:'-10'}).reason).toBeTruthy();expect(parseTargetDraft({AAPL:'60',MSFT:'60'}).reason).toBeTruthy();expect(parseTargetDraft({AAPL:'40',MSFT:'40'}).cash).toBeCloseTo(.2);
    const {s}=fixture();const rows=targetRows(s,s.targetAllocation!).rows;expect(rows.find(r=>r.symbol==='CASH')?.current).toBe(.4);expect(rows.find(r=>r.symbol==='MSFT')?.status).toBe('Underweight');
  });
  it('reuses existing minimum variance and never mutates analytics',()=>{
    const {a}=fixture();const before=JSON.stringify(a);const r=planningMinimumVariance(a);expect(r.result!.optimizedVolatility).toBeLessThanOrEqual(r.result!.currentVolatility+1e-8);expect(JSON.stringify(a)).toBe(before);
  });
});
