import React from 'react';

export default function TwinConfigPage() {
    return (
        <div className="p-8 max-w-4xl mx-auto text-white bg-gray-900 min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-blue-400">Digital Twin Configuration</h1>
            <p className="mb-8 text-gray-300 text-lg">Define your role, constraints, and company context to customize AxWise Context Engine reasoning.</p>

            <form className="space-y-6 bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700">
                <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">Role</label>
                    <input type="text" placeholder="e.g. UX Researcher" className="w-full p-3 rounded-lg bg-gray-900 border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">Seniority</label>
                    <input type="text" placeholder="e.g. Senior" className="w-full p-3 rounded-lg bg-gray-900 border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">Company Context</label>
                    <textarea rows={3} placeholder="Enterprise B2B SaaS, 500+ employees..." className="w-full p-3 rounded-lg bg-gray-900 border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">Communication Flaws (What to avoid)</label>
                    <textarea rows={2} placeholder="Too academic, ignores engineering constraints..." className="w-full p-3 rounded-lg bg-gray-900 border border-gray-600 focus:outline-none focus:border-blue-500 transition-colors" />
                </div>

                <div className="pt-4">
                    <button type="button" className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1">
                        Save Digital Twin
                    </button>
                </div>
            </form>
        </div>
    );
}
