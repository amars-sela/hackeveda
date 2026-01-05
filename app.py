import json
import re
import sqlite3
import uuid
import hashlib
from datetime import datetime
import google.generativeai as genai
from flask import Flask, request, Response, stream_with_context, session, jsonify
from flask_cors import CORS

app = Flask(__name__)
app.secret_key = 'tender-viewer-secret-key-2025'
CORS(app, origins="*", supports_credentials=True, allow_headers=['Content-Type'], expose_headers=['Set-Cookie'])

GEMINI_API_KEY = '####'
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-pro')

# Initialize database
def init_db():
    conn = sqlite3.connect('sessions.db')
    with open('sessions.sql', 'r') as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()

init_db()

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if len(username) < 3 or len(password) < 4:
        return jsonify({'success': False, 'message': 'Username min 3 chars, password min 4 chars'}), 400
    
    conn = sqlite3.connect('sessions.db')
    try:
        new_session_id = str(uuid.uuid4())
        conn.execute('INSERT INTO users (username, password, session_id) VALUES (?, ?, ?)', (username, hash_password(password), new_session_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Account created successfully'})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'message': 'Username already exists'}), 400

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    conn = sqlite3.connect('sessions.db')
    cursor = conn.execute('SELECT id, username, session_id FROM users WHERE username = ? AND password = ?', 
                          (username, hash_password(password)))
    user = cursor.fetchone()
    
    if user:
        session['user_id'] = user[0]
        session['username'] = user[1]
        if user[2]:
            session['session_id'] = user[2]
        else:
            session['session_id'] = str(uuid.uuid4())
            conn.execute('UPDATE users SET session_id = ? WHERE id = ?', (session['session_id'], user[0]))
            conn.commit()
        conn.close()
        return jsonify({'success': True, 'username': user[1]})
    conn.close()
    return jsonify({'success': False, 'message': 'Invalid credentials'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/user', methods=['GET'])
def get_user():
    if 'user_id' in session:
        return jsonify({'logged_in': True, 'username': session.get('username')})
    return jsonify({'logged_in': False})

@app.route('/api/chat-history', methods=['GET'])
def get_chat_history():
    if 'user_id' not in session:
        return jsonify({'history': []})
    session_id = get_session_id()
    history = get_conversation_history(session_id, limit=50)
    return jsonify({'history': history})

@app.route('/api/new-session', methods=['POST'])
def new_session():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    
    # Generate new session ID
    new_session_id = str(uuid.uuid4())
    session['session_id'] = new_session_id
    
    # Update user's session ID in database
    conn = sqlite3.connect('sessions.db')
    user_id = session.get('user_id')
    conn.execute('UPDATE users SET session_id = ? WHERE id = ?', (new_session_id, user_id))
    conn.execute('INSERT INTO sessions (session_id, user_id) VALUES (?, ?)', (new_session_id, user_id))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

def get_session_id():
    if 'session_id' not in session:
        session['session_id'] = str(uuid.uuid4())
        conn = sqlite3.connect('sessions.db')
        user_id = session.get('user_id')
        conn.execute('INSERT INTO sessions (session_id, user_id) VALUES (?, ?)', (session['session_id'], user_id))
        conn.commit()
        conn.close()
    return session['session_id']

def save_message(session_id, role, message):
    conn = sqlite3.connect('sessions.db')
    user_id = session.get('user_id')
    conn.execute('INSERT INTO conversation_history (session_id, role, message) VALUES (?, ?, ?)',
                 (session_id, role, message))
    conn.execute('UPDATE sessions SET last_activity = ?, user_id = ? WHERE session_id = ?',
                 (datetime.now(), user_id, session_id))
    conn.commit()
    conn.close()

def get_conversation_history(session_id, limit=10):
    conn = sqlite3.connect('sessions.db')
    cursor = conn.execute(
        'SELECT role, message FROM conversation_history WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?',
        (session_id, limit)
    )
    history = cursor.fetchall()
    conn.close()
    return list(reversed(history))

@app.route('/api/ai-search', methods=['POST', 'OPTIONS'])
def ai_search():
    if request.method == 'OPTIONS':
        r = Response()
        r.headers['Access-Control-Allow-Origin'] = '*'
        r.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        r.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return r
    
    data = request.json
    query = data.get('query', '')
    all_data = data.get('data', [])
    filtered_results = data.get('filteredResults', [])
    
    # Session management
    try:
        session_id = get_session_id()
        save_message(session_id, 'user', query)
        history = get_conversation_history(session_id, limit=5)
        context = "\n".join([f"{role}: {msg[:200]}" for role, msg in history[:-1]]) if len(history) > 1 else ""
    except:
        context = ""
    
    sample = json.dumps(all_data[:30], indent=2) if len(all_data) > 30 else json.dumps(all_data, indent=2)
    data_count = len(all_data)
    
    context_section = f"Previous conversation:\n{context}\n\n" if context else ""
    
    prompt = f"""Query: "{query}"

{context_section}Sample data ({data_count} total records):
{sample}

IMPORTANT: When generating the summary, analyze ALL records that match the filters, not just this sample. The summary should reflect the actual count of matching records based on the applied filters.

Respond with EXACTLY this format:

FILTERS:{{"key":"value"}}
OUTPUT ORDER (MANDATORY)

First: A brief analytical summary in 4–5 short paragraphs explaining what was asked and what was found.

Second: A bullet-point list of PDF file names (from File_Name) that match the filters.

Third: A structured summary using the EXACT paragraph headings and layout defined below.
FORMAT RULES (NON-NEGOTIABLE)

Do NOT add extra headings, explanations, or commentary

Do NOT reorder paragraphs

Do NOT merge paragraphs

Use plain text only (no markdown headings except where shown)

Bullet points must use • only

Currency must be expressed in lakhs or crores (₹)

Counts must be numerically accurate

If data is missing, state “Not specified” (do not guess)
FILTER SYNTAX (USE EXACT JSON STRUCTURE)

Text match
{{"Ministry_State_Name":"Defence"}}

Greater than
{{"Estimated_Bid_Value":{{"op":"gt","value":1000000}}}}

Less than
{{"EMD_Amount":{{"op":"lt","value":50000}}}}

Sort descending
{{"_sort":"Estimated_Bid_Value","_order":"desc"}}

Limit
{{"_limit":10}}

👉 Modify filters only based on the user’s query
👉 Use multiple filters together when applicable

Available columns: Ministry_State_Name, Department_Name, Organisation_Name, Item_Category, Estimated_Bid_Value, EMD_Amount, Type_of_Bid, Tender_City, File_Name, Minimum_Average_Annual_Turnover__3_Years_, Years_of_Past_Experience_Required, MSE_Exemption_for_Experience_and_Turnover, Startup_Exemption_for_Experience_and_Turnover, Documents_Required_From_Seller, Show_Uploaded_Bidder_Documents_To_All, Bid_to_RA_Enabled, RA_Qualification_Rule, Time_Allowed_for_Technical_Clarifications, Floor_Price, Evaluation_Method, Financial_Document_Price_Breakup_Required, Arbitration_Clause, Mediation_Clause, Advisory_Bank, ePBG_Detail_Requirement, ePBG_Percentage, Duration_of_ePBG, Splitting_Applied, Maximum_Bidders, Split_Criteria, MII_Compliance, MSE_Purchase_Preference, Pre_Bid_Date_Time, Pre_Bid_Venue, Technical_Specification_Description, Consignee_Reporting_Officer, Summary, Success_Critera, Scope_of_Work

IMPORTANT - YOU MUST FOLLOW THIS EXACT FORMAT:

Paragraph 1 – Overview

What was searched

Number of matching tenders

Tender categories / bid types involved

Paragraph 2 – Value Analysis

Minimum bid value

Maximum bid value

Average bid value

EMD range

(Values must be expressed in ₹ lakhs / ₹ crores)

Paragraph 3 – Ministry & Location

USE BULLET POINTS ON SEPARATE LINES ONLY

Ministries:
• Ministry Name – X tenders
• Ministry Name – X tenders

Locations:
• City Name – X tenders
• City Name – X tenders

Paragraph 4 – Eligibility

Turnover requirements (3-year average)

Experience required (years)

MSE / Startup exemptions

Key documents required from seller
STRICT EXAMPLE (follow this format exactly):
FILTERS:{{"Estimated_Bid_Value":{{"op":"gt","value":1000000}}}}
SUMMARY:
[4–5 paragraph brief narrative summary]

Matching PDF Files:
• GEM_2025_R_499715.pdf
• GEM_2025_R_500969.pdf

Paragraph 1 – Overview:
I found 15 high-value government tenders exceeding ₹10 lakhs across defence, IT, and infrastructure procurement categories.

Paragraph 2 – Value Analysis:
The bid values range from ₹12.5 lakhs to ₹4.83 crores, with an average tender size of ₹85 lakhs. EMD amounts range between ₹25,000 and ₹5 lakhs.

Paragraph 3 – Ministry & Location:
Ministries:
• Ministry of Defence – 6 tenders
• Ministry of Finance – 3 tenders

Locations:
• Delhi NCR – 8 tenders
• Mumbai – 4 tenders

Paragraph 4 – Eligibility:
Most tenders require a minimum average turnover of ₹50 lakhs to ₹2 crores over the last 3 years, with 3–5 years of prior experience. MSE exemptions apply to approximately 60% of tenders. Required documents include GST registration, PAN, and past work orders.
"""

    def generate():
        try:
            response = model.generate_content(prompt)
            text = response.text
            
            # Save AI response to session
            try:
                save_message(session_id, 'assistant', text)
            except:
                pass
            
            # Extract filters
            filters = {}
            if "FILTERS:" in text:
                try:
                    start = text.index("FILTERS:") + 8
                    brace_count = 0
                    end = start
                    for i, c in enumerate(text[start:], start):
                        if c == '{': brace_count += 1
                        elif c == '}': brace_count -= 1
                        if brace_count == 0 and c == '}':
                            end = i + 1
                            break
                    if end > start:
                        fj = text[start:end].strip()
                        filters = json.loads(fj)
                except: pass
            
            # Send filters
            if filters:
                yield f"data: {json.dumps({'type': 'filters', 'content': json.dumps(filters)})}\n\n"
            
            # Extract and send summary - remove FILTERS section properly
            summary = text
            if "FILTERS:" in summary:
                start = summary.index("FILTERS:")
                brace_count = 0
                end = start
                found_brace = False
                for i, c in enumerate(summary[start:], start):
                    if c == '{': 
                        brace_count += 1
                        found_brace = True
                    elif c == '}': 
                        brace_count -= 1
                    if found_brace and brace_count == 0:
                        end = i + 1
                        break
                summary = summary[:start] + summary[end:]
            
            summary = re.sub(r'SUMMARY:', '', summary)
            summary = re.sub(r'```[a-z]*', '', summary)
            summary = re.sub(r'^[\s\n}]+', '', summary)  # Remove leading }, whitespace
            summary = summary.strip()
            if summary:
                yield f"data: {json.dumps({'type': 'summary', 'content': summary})}\n\n"
            
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
    
    r = Response(stream_with_context(generate()), mimetype='text/event-stream')
    r.headers['Access-Control-Allow-Origin'] = '*'
    r.headers['Cache-Control'] = 'no-cache'
    return r

@app.route('/api/extract-info', methods=['POST', 'OPTIONS'])
def extract_info():
    if request.method == 'OPTIONS':
        r = Response()
        r.headers['Access-Control-Allow-Origin'] = '*'
        r.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        r.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return r
    
    data = request.json
    query = data.get('query', '')
    filtered_results = data.get('filteredResults', [])
    
    extract_model = genai.GenerativeModel('gemini-2.5-flash')
    
    prompt = f"""Query: "{query}"

Filtered tender data:
{json.dumps(filtered_results, indent=2)}

Extract and summarize the specific information requested in the query from these tender records. 

Format your response as:
1. First list all the File Names from the filtered results
2. Then provide the specific information requested in the query

Be concise and organized."""
    
    def generate():
        try:
            response = extract_model.generate_content(prompt, stream=True)
            for chunk in response:
                if chunk.text:
                    yield f"data: {json.dumps({'type': 'content', 'content': chunk.text})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
    
    r = Response(stream_with_context(generate()), mimetype='text/event-stream')
    r.headers['Access-Control-Allow-Origin'] = '*'
    r.headers['Cache-Control'] = 'no-cache'
    return r

@app.route('/api/health', methods=['GET'])
def health():
    return {'status': 'ok'}

@app.route('/api/analyze-tender', methods=['POST', 'OPTIONS'])
def analyze_tender():
    if request.method == 'OPTIONS':
        r = Response()
        r.headers['Access-Control-Allow-Origin'] = '*'
        r.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        r.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return r
    
    tender = request.json.get('tender', {})
    analyze_model = genai.GenerativeModel('gemini-2.5-flash')
    
    prompt = f"""Analyze this government tender and provide insider insights:

{json.dumps(tender, indent=2)}

Provide:
1. Key Opportunity Assessment (is this worth bidding?)
2. Risk Factors to consider
3. Eligibility Requirements summary
4. Important Dates & Deadlines
5. Estimated Competition Level
6. Strategic Recommendations

Be concise and actionable."""

    def generate():
        try:
            response = analyze_model.generate_content(prompt, stream=True)
            for chunk in response:
                if chunk.text:
                    yield f"data: {json.dumps({'type': 'content', 'content': chunk.text})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
    
    r = Response(stream_with_context(generate()), mimetype='text/event-stream')
    r.headers['Access-Control-Allow-Origin'] = '*'
    r.headers['Cache-Control'] = 'no-cache'
    return r

@app.route('/')
def serve_index():
    with open('index.html', encoding='utf-8') as f:
        return f.read(), 200, {'Content-Type': 'text/html'}

@app.route('/hackdemo_database.sql')
def serve_sql():
    return open('hackdemo_database.sql', encoding='utf-8').read(), 200, {'Content-Type': 'text/plain'}

@app.route('/logo.png')
def serve_logo():
    return open('logo.png', 'rb').read(), 200, {'Content-Type': 'image/png'}

@app.route('/styles.css')
def serve_css():
    with open('styles.css', encoding='utf-8') as f:
        return f.read(), 200, {'Content-Type': 'text/css'}

@app.route('/script.js')
def serve_js():
    return open('script.js', 'r', encoding='utf-8').read(), 200, {'Content-Type': 'application/javascript'}

if __name__ == '__main__':
    print("Starting on port 5050...")
    app.run(debug=False, host='0.0.0.0', port=5050)
