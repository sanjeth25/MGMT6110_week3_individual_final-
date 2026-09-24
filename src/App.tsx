/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { TOWNS, FLAT_TYPES } from '../constants.js';
import {
  Building2,
  TrendingUp,
  Calendar,
  Layers,
  AlertCircle,
  AlertTriangle,
  WifiOff,
  Loader2,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface ResaleData {
  town: string;
  flat_type: string;
  latest_month: string | null;
  transactions_used: number;
  typical_price: number | null;
}

type ViewState =
  | { status: 'loading' }
  | { status: 'empty'; town: string; flatType: string }
  | { status: 'refused'; reason: string }
  | { status: 'unreachable' }
  | { status: 'success'; data: ResaleData };

interface HealthData {
  keyConfigured: string;
  upstreamAnswered: boolean;
  upstreamStatus: number | null;
}

export default function App() {
  const [selectedTown, setSelectedTown] = useState<string>('ANG MO KIO');
  const [selectedFlatType, setSelectedFlatType] = useState<string>('4 ROOM');
  const [viewState, setViewState] = useState<ViewState>({ status: 'loading' });
  const [healthInfo, setHealthInfo] = useState<HealthData | null>(null);
  const [isHealthChecking, setIsHealthChecking] = useState<boolean>(false);

  // Request race-condition prevention: AbortController and Request ID tracking
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRequestIdRef = useRef<number>(0);

  const fetchResaleData = (town: string, flatType: string) => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const thisRequestId = ++currentRequestIdRef.current;

    setViewState({ status: 'loading' });

    const searchParams = new URLSearchParams({
      town: town,
      flat_type: flatType,
    });

    fetch(`/api/resale?${searchParams.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        // Discard response if request is obsolete
        if (thisRequestId !== currentRequestIdRef.current) {
          return;
        }

        if (!response.ok) {
          let errorMsg = `HTTP ${response.status}`;
          try {
            const errBody = await response.json();
            if (errBody?.error) {
              errorMsg = errBody.error;
            }
          } catch {
            // response was not JSON
          }

          if (response.status === 502 || response.status === 503 || errorMsg.toLowerCase().includes('unreachable')) {
            setViewState({ status: 'unreachable' });
          } else {
            setViewState({
              status: 'refused',
              reason: errorMsg,
            });
          }
          return;
        }

        const data: ResaleData = await response.json();

        // Discard response if request is obsolete
        if (thisRequestId !== currentRequestIdRef.current) {
          return;
        }

        if (data.typical_price === null || data.transactions_used === 0) {
          setViewState({
            status: 'empty',
            town: data.town || town,
            flatType: data.flat_type || flatType,
          });
        } else {
          setViewState({
            status: 'success',
            data,
          });
        }
      })
      .catch((err: any) => {
        // If aborted, do nothing (new request is already in flight)
        if (err.name === 'AbortError') {
          return;
        }

        if (thisRequestId === currentRequestIdRef.current) {
          setViewState({ status: 'unreachable' });
        }
      });
  };

  useEffect(() => {
    fetchResaleData(selectedTown, selectedFlatType);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [selectedTown, selectedFlatType]);

  const checkHealth = async () => {
    setIsHealthChecking(true);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHealthInfo(data);
      } else {
        setHealthInfo({
          keyConfigured: 'not required',
          upstreamAnswered: false,
          upstreamStatus: res.status,
        });
      }
    } catch {
      setHealthInfo({
        keyConfigured: 'not required',
        upstreamAnswered: false,
        upstreamStatus: null,
      });
    } finally {
      setIsHealthChecking(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatMonth = (monthStr: string | null) => {
    if (!monthStr) return 'N/A';
    const parts = monthStr.split('-');
    if (parts.length === 2) {
      const year = parts[0];
      const monthIndex = parseInt(parts[1], 10) - 1;
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      if (monthIndex >= 0 && monthIndex < 12) {
        return `${monthNames[monthIndex]} ${year} (${monthStr})`;
      }
    }
    return monthStr;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-sm">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Singapore HDB Resale Prices
              </h1>
              <p className="text-xs text-slate-500">
                Live datastore records from data.gov.sg
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={checkHealth}
              disabled={isHealthChecking}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 transition cursor-pointer disabled:opacity-50"
              title="Test /api/health endpoint"
            >
              {isHealthChecking ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>API Health</span>
            </button>

            {healthInfo && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-slate-100 border border-slate-200 text-slate-600">
                Upstream:{' '}
                {healthInfo.upstreamAnswered ? (
                  <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> {healthInfo.upstreamStatus}
                  </span>
                ) : (
                  <span className="text-rose-600 font-semibold flex items-center gap-0.5">
                    <AlertCircle className="w-3 h-3" /> Error
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 flex-1">
        {/* Selection Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs mb-8">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-slate-800">
              Select Town and Flat Type
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Select any Singapore HDB town and flat type to view the latest typical median resale figure.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Town Selector */}
            <div>
              <label
                htmlFor="town-select"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2"
              >
                HDB Town ({TOWNS.length} available)
              </label>
              <div className="relative">
                <select
                  id="town-select"
                  value={selectedTown}
                  onChange={(e) => setSelectedTown(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium appearance-none focus:outline-hidden focus:ring-2 focus:ring-red-500 focus:border-red-500 transition cursor-pointer text-sm"
                >
                  {TOWNS.map((town) => (
                    <option key={town} value={town}>
                      {town}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Flat Type Selector */}
            <div>
              <label
                htmlFor="flat-type-select"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2"
              >
                Flat Type ({FLAT_TYPES.length} available)
              </label>
              <div className="relative">
                <select
                  id="flat-type-select"
                  value={selectedFlatType}
                  onChange={(e) => setSelectedFlatType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-slate-800 font-medium appearance-none focus:outline-hidden focus:ring-2 focus:ring-red-500 focus:border-red-500 transition cursor-pointer text-sm"
                >
                  {FLAT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Display Area */}
        <div className="space-y-6">
          {/* Case 1: Data is loading */}
          {viewState.status === 'loading' && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8 text-center text-blue-900 shadow-xs transition">
              <div className="flex flex-col items-center justify-center space-y-3">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="text-base font-medium">
                  Fetching the latest resale transaction data for {selectedTown} ({selectedFlatType})...
                </p>
                <p className="text-xs text-blue-600">
                  Calling serverless endpoint /api/resale
                </p>
              </div>
            </div>
          )}

          {/* Case 2: Data is empty */}
          {viewState.status === 'empty' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center text-amber-900 shadow-xs">
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <p className="text-base font-medium">
                  No resale transactions were found for {viewState.flatType} flats in {viewState.town} within the dataset.
                </p>
                <p className="text-xs text-amber-700 max-w-md">
                  Certain combinations, such as MULTI-GENERATION flats in smaller or newer estates, have zero recorded sales. Try switching to a different flat type or town.
                </p>
              </div>
            </div>
          )}

          {/* Case 3: Upstream refused */}
          {viewState.status === 'refused' && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8 text-center text-rose-900 shadow-xs">
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-base font-medium">
                  The data.gov.sg service refused the request ({viewState.reason}).
                </p>
                <p className="text-xs text-rose-700">
                  Please verify parameter configurations or try again shortly.
                </p>
              </div>
            </div>
          )}

          {/* Case 4: Upstream unreachable */}
          {viewState.status === 'unreachable' && (
            <div className="bg-slate-100 border border-slate-300 rounded-2xl p-8 text-center text-slate-800 shadow-xs">
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                  <WifiOff className="w-6 h-6" />
                </div>
                <p className="text-base font-medium">
                  The data.gov.sg service could not be reached. Please check network connectivity or try again shortly.
                </p>
                <p className="text-xs text-slate-500">
                  The upstream datastore endpoint did not respond to the serverless request.
                </p>
              </div>
            </div>
          )}

          {/* Success: Display live price statistics */}
          {viewState.status === 'success' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Selected Location &amp; Flat Type
                  </span>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-lg font-bold text-slate-900">
                      {viewState.data.town}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                      {viewState.data.flat_type}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
                    Dataset Status
                  </span>
                  <span className="text-xs font-medium text-emerald-600 flex items-center gap-1 justify-end mt-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Live Data Connected
                  </span>
                </div>
              </div>

              {/* Price Highlight */}
              <div className="py-8 text-center">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Typical Resale Price (Median of Latest 3 Active Months)
                </span>
                <div className="mt-2 text-4xl sm:text-5xl font-black text-slate-900 tracking-tight flex items-center justify-center gap-2">
                  <TrendingUp className="w-8 h-8 sm:w-10 sm:h-10 text-red-600 inline" />
                  <span>{formatPrice(viewState.data.typical_price!)}</span>
                </div>
                <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
                  Computed as the exact median of the latest 3 active months present in the datastore, ensuring robust figures even for low-volume flat categories.
                </p>
              </div>

              {/* Statistical Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-slate-100">
                <div className="bg-slate-50 rounded-xl p-4 flex items-center gap-3 border border-slate-100">
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 font-medium block">
                      Latest Month Found
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {formatMonth(viewState.data.latest_month)}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 flex items-center gap-3 border border-slate-100">
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 font-medium block">
                      Transactions Used
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {viewState.data.transactions_used} recorded sales
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer with exact Singapore Open Data Licence attribution */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-slate-500 text-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-2 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="leading-relaxed">
            Contains information from{' '}
            <span className="font-semibold text-slate-700">HDB Resale Flat Prices</span> accessed
            on <span className="font-semibold text-slate-700">24 September 2026</span> from{' '}
            <a
              href="https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-600 hover:underline font-medium inline-flex items-center gap-0.5"
            >
              data.gov.sg
              <ExternalLink className="w-3 h-3" />
            </a>{' '}
            which is made available under the terms of the{' '}
            <a
              href="https://data.gov.sg/open-data-licence"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-600 hover:underline font-medium inline-flex items-center gap-0.5"
            >
              Singapore Open Data Licence version 1.0
              <ExternalLink className="w-3 h-3" />
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}
