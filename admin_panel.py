from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, send_from_directory, abort
import csv
import io
import json
import os
from datetime import datetime
from werkzeug.utils import secure_filename
import uuid
from functools import wraps

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-123')  # Use environment variable in production
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['ADMIN_USERNAME'] = os.environ.get('ADMIN_USERNAME', 'admin')
app.config['ADMIN_PASSWORD'] = os.environ.get('ADMIN_PASSWORD', 'admin123')

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# In-memory storage for properties (replace with database in production)
properties = []
users = []  # Simple user storage (replace with database in production)

# Allowed file extensions
ALLOWED_EXTENSIONS = {'json', 'csv'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

def generate_demo_property():
    """Generate a demo property with realistic data"""
    property_types = ['Single Family', 'Condo', 'Townhouse', 'Multi-Family']
    statuses = ['For Sale', 'Pending', 'Sold', 'Off Market']
    addresses = [
        '123 Main St, Anytown, USA',
        '456 Oak Ave, Somewhere, USA',
        '789 Pine Rd, Nowhere, USA',
        '101 Elm St, Anywhere, USA'
    ]
    
    return {
        'id': str(uuid.uuid4()),
        'address': addresses[len(properties) % len(addresses)],
        'price': f"${(300000 + (len(properties) * 50000)):,}",
        'beds': 2 + (len(properties) % 4),
        'baths': 1 + (len(properties) % 3),
        'sqft': 1000 + (len(properties) * 200),
        'status': statuses[len(properties) % len(statuses)],
        'type': property_types[len(properties) % len(property_types)],
        'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'photos': [f"https://placehold.co/800x600/1a2636/2db5e5?text=Property+{len(properties)+1}"],
        'description': 'This is a sample property description.'
    }

# Generate some demo data
for _ in range(5):
    properties.append(generate_demo_property())

@app.route('/')
def index():
    return redirect(url_for('dashboard'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        if (username == app.config['ADMIN_USERNAME'] and 
            password == app.config['ADMIN_PASSWORD']):
            session['user_id'] = str(uuid.uuid4())
            session['username'] = username
            flash('Login successful!', 'success')
            next_page = request.args.get('next') or url_for('dashboard')
            return redirect(next_page)
        flash('Invalid username or password', 'danger')
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    flash('You have been logged out.', 'info')
    return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    stats = {
        'total_properties': len(properties),
        'for_sale': len([p for p in properties if p['status'] == 'For Sale']),
        'pending': len([p for p in properties if p['status'] == 'Pending']),
        'sold': len([p for p in properties if p['status'] == 'Sold'])
    }
    return render_template('dashboard.html', stats=stats, properties=properties[:5])

@app.route('/properties')
@login_required
def list_properties():
    page = request.args.get('page', 1, type=int)
    per_page = 10
    start = (page - 1) * per_page
    end = start + per_page
    paginated_properties = properties[start:end]
    return render_template('properties/list.html', 
                         properties=paginated_properties, 
                         page=page, 
                         total_pages=(len(properties) // per_page) + 1)

@app.route('/properties/<property_id>')
@login_required
def view_property(property_id):
    property = next((p for p in properties if p['id'] == property_id), None)
    if not property:
        abort(404)
    return render_template('properties/view.html', property=property)

@app.route('/properties/add', methods=['GET', 'POST'])
@login_required
def add_property():
    if request.method == 'POST':
        try:
            new_property = {
                'id': str(uuid.uuid4()),
                'address': request.form.get('address'),
                'price': request.form.get('price'),
                'beds': int(request.form.get('beds', 0)),
                'baths': float(request.form.get('baths', 0)),
                'sqft': int(request.form.get('sqft', 0)),
                'status': request.form.get('status', 'For Sale'),
                'type': request.form.get('type', 'Single Family'),
                'description': request.form.get('description', ''),
                'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'photos': []
            }
            
            # Handle file uploads
            if 'photos' in request.files:
                for file in request.files.getlist('photos'):
                    if file and allowed_file(file.filename):
                        filename = secure_filename(file.filename)
                        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                        file.save(filepath)
                        new_property['photos'].append(url_for('uploaded_file', filename=filename))
            
            properties.insert(0, new_property)
            flash('Property added successfully!', 'success')
            return redirect(url_for('view_property', property_id=new_property['id']))
        except Exception as e:
            app.logger.error(f"Error adding property: {str(e)}")
            flash('Error adding property. Please try again.', 'danger')
    
    return render_template('properties/add.html')

@app.route('/properties/import', methods=['GET', 'POST'])
@login_required
def import_properties():
    if request.method == 'POST':
        if 'file' not in request.files:
            flash('No file part', 'danger')
            return redirect(request.url)
        
        file = request.files['file']
        if file.filename == '':
            flash('No selected file', 'danger')
            return redirect(request.url)
        
        if file and allowed_file(file.filename):
            try:
                if file.filename.endswith('.csv'):
                    # Read CSV file
                    stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
                    csv_reader = csv.DictReader(stream)
                    imported = 0
                    
                    for row in csv_reader:
                        try:
                            new_property = {
                                'id': str(uuid.uuid4()),
                                'address': row.get('address', ''),
                                'price': row.get('price', ''),
                                'beds': int(row.get('beds', 0)),
                                'baths': float(row.get('baths', 0)),
                                'sqft': int(row.get('sqft', 0)),
                                'status': row.get('status', 'For Sale'),
                                'type': row.get('type', 'Single Family'),
                                'description': row.get('description', ''),
                                'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                'photos': []
                            }
                            properties.append(new_property)
                            imported += 1
                        except Exception as e:
                            app.logger.error(f"Error processing CSV row: {str(e)}")
                            continue
                            
                    flash(f'Successfully imported {imported} properties from CSV', 'success')
                
                elif file.filename.endswith('.json'):
                    # Read JSON file
                    data = json.load(file)
                    if isinstance(data, list):
                        for item in data:
                            item['id'] = str(uuid.uuid4())
                            item['last_updated'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                            if 'photos' not in item:
                                item['photos'] = []
                            properties.append(item)
                        flash(f'Successfully imported {len(data)} properties from JSON', 'success')
                    else:
                        flash('Invalid JSON format. Expected an array of properties.', 'danger')
                
                return redirect(url_for('list_properties'))
            
            except Exception as e:
                app.logger.error(f"Error importing properties: {str(e)}")
                flash('Error importing properties. Please check the file format.', 'danger')
    
    return render_template('properties/import.html')

@app.route('/properties/export')
@login_required
def export_properties():
    try:
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        if properties:
            writer.writerow(properties[0].keys())
        
        # Write data
        for prop in properties:
            writer.writerow(prop.values())
        
        output.seek(0)
        return output.getvalue(), 200, {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename=properties_export.csv'
        }
    except Exception as e:
        app.logger.error(f"Error exporting properties: {str(e)}")
        flash('Error exporting properties', 'danger')
        return redirect(url_for('list_properties'))

@app.route('/uploads/<filename>')
@login_required
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/properties', methods=['GET'])
def api_properties():
    return jsonify(properties)

@app.route('/api/properties/<property_id>', methods=['GET'])
def api_property(property_id):
    property = next((p for p in properties if p['id'] == property_id), None)
    if not property:
        return jsonify({'error': 'Property not found'}), 404
    return jsonify(property)

@app.errorhandler(404)
def page_not_found(e):
    return render_template('errors/404.html'), 404

@app.errorhandler(500)
def internal_server_error(e):
    return render_template('errors/500.html'), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)